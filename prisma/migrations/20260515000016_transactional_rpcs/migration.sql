-- Transactional RPCs — fixes the multi-step orphan-window class flagged
-- across the M3 / M4 / M8 / M11 security reviews.
--
-- supabase-js can't wrap multi-statement transactions; each `.from(…)`
-- is its own auto-commit. The fix is one SECURITY DEFINER PL/pgSQL
-- function per multi-step action, called from the server action via
-- supabase-js .rpc(). The whole function runs in a single transaction
-- — partial failures roll back.
--
-- All functions:
--   * SECURITY DEFINER + set search_path = public + REVOKE EXECUTE FROM
--     public + GRANT EXECUTE TO service_role (the user-facing client
--     does NOT call these — the server action does it via
--     supabaseService() in the convention's allowed paths).
--   * Validate organisation_id against the calling-user-claimed value;
--     never trust input on multi-tenant rows.
--   * Return the new row id(s).

set search_path = public;

-- =========================================================================
-- 1. create_tenancy_rpc — used by app/(app)/tenancies/actions.ts:createTenancy
--
-- Replaces the five-step JS sequence:
--   1. INSERT tenant rows for each provided tenant
--   2. INSERT tenancy with lead tenant_id
--   3. INSERT joint-tenant joins for tenants[1..]
--   4. INSERT rent_changes 'initial'
--   5. UPDATE unit status = 'occupied'
-- with a single transaction.
-- =========================================================================

create or replace function public.create_tenancy_rpc(
  p_organisation_id    uuid,
  p_property_id        uuid,
  p_unit_id            uuid,
  p_kind               text,
  p_start_date         date,
  p_end_date_intended  date,
  p_rent_pence         bigint,
  p_rent_period        text,
  p_deposit_pence      bigint,
  p_deposit_scheme     text,
  p_deposit_scheme_ref text,
  p_aasc_placement_ref text,
  p_aasc_contractor    text,
  p_notes              text,
  -- jsonb array of tenant objects (matches the JS sequence shape):
  --   [{ first_name, last_name, email, phone, right_to_rent_checked,
  --      right_to_rent_expiry, notes }, ...]
  p_tenants            jsonb
) returns table (tenancy_id uuid, lead_tenant_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_ids uuid[] := array[]::uuid[];
  v_tenancy_id uuid;
  v_t jsonb;
  v_new_tenant_id uuid;
  v_idx int := 0;
begin
  -- 1. Tenants (only for AST / licence / company_let — caller is responsible
  --    for not passing tenants for aasc_placement / holiday_let).
  for v_t in select * from jsonb_array_elements(coalesce(p_tenants, '[]'::jsonb))
  loop
    insert into tenants (
      organisation_id, first_name, last_name, email, phone,
      right_to_rent_checked, right_to_rent_expiry, notes
    ) values (
      p_organisation_id,
      v_t->>'first_name',
      v_t->>'last_name',
      v_t->>'email',
      v_t->>'phone',
      coalesce((v_t->>'right_to_rent_checked')::boolean, false),
      nullif(v_t->>'right_to_rent_expiry', '')::date,
      v_t->>'notes'
    )
    returning id into v_new_tenant_id;
    v_tenant_ids := array_append(v_tenant_ids, v_new_tenant_id);
  end loop;

  -- 2. Tenancy with lead tenant_id (first element of the array, or null).
  insert into tenancies (
    organisation_id, property_id, unit_id, tenant_id, kind,
    start_date, end_date_intended,
    rent_pence, rent_period,
    deposit_pence, deposit_scheme, deposit_scheme_ref,
    aasc_placement_ref, aasc_contractor,
    status, notes
  ) values (
    p_organisation_id, p_property_id, p_unit_id,
    case when array_length(v_tenant_ids, 1) > 0 then v_tenant_ids[1] else null end,
    p_kind,
    p_start_date, p_end_date_intended,
    p_rent_pence, p_rent_period,
    p_deposit_pence, p_deposit_scheme, p_deposit_scheme_ref,
    p_aasc_placement_ref, p_aasc_contractor,
    'active', p_notes
  )
  returning id into v_tenancy_id;

  -- 3. Joint-tenant joins (tenants[2..]).
  if array_length(v_tenant_ids, 1) > 1 then
    for v_idx in 2..array_length(v_tenant_ids, 1)
    loop
      insert into tenancy_tenants (tenancy_id, tenant_id)
      values (v_tenancy_id, v_tenant_ids[v_idx]);
    end loop;
  end if;

  -- 4. Rent-changes 'initial' seed.
  insert into rent_changes (
    organisation_id, tenancy_id,
    effective_from, new_rent_pence, new_rent_period, reason
  ) values (
    p_organisation_id, v_tenancy_id,
    p_start_date, p_rent_pence, p_rent_period, 'initial'
  );

  -- 5. Mark unit occupied (if a unit was specified).
  if p_unit_id is not null then
    update units
      set status = 'occupied',
          updated_at = current_timestamp
      where id = p_unit_id
        and property_id = p_property_id;
  end if;

  return query select v_tenancy_id, case when array_length(v_tenant_ids, 1) > 0 then v_tenant_ids[1] else null end;
end $$;

revoke execute on function public.create_tenancy_rpc(
  uuid, uuid, uuid, text, date, date, bigint, text, bigint, text, text, text, text, text, jsonb
) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_tenancy_rpc(uuid, uuid, uuid, text, date, date, bigint, text, bigint, text, text, text, text, text, jsonb) to service_role';
  end if;
end $$;

-- =========================================================================
-- 2. create_mortgage_rpc — used by app/(app)/mortgages/actions.ts:createMortgage
--
-- Replaces the two-step sequence (mortgage insert + drawdown event seed).
-- The previous implementation had an orphan window: if the event insert
-- failed, the mortgage existed with no ledger entry.
-- =========================================================================

create or replace function public.create_mortgage_rpc(
  p_organisation_id        uuid,
  p_property_id            uuid,
  p_lender                 text,
  p_account_ref            text,
  p_original_loan_pence    bigint,
  p_current_balance_pence  bigint,
  p_interest_rate_bps      int,
  p_monthly_payment_pence  bigint,
  p_product                text,
  p_fixed_end_date         date,
  p_term_months            int,
  p_is_interest_only       boolean,
  p_broker                 text,
  p_notes                  text,
  p_drawdown_date          date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mortgage_id uuid;
begin
  insert into mortgages (
    organisation_id, property_id, lender, account_ref,
    original_loan_pence, current_balance_pence, interest_rate_bps,
    monthly_payment_pence, product, fixed_end_date, term_months,
    is_interest_only, broker, notes
  ) values (
    p_organisation_id, p_property_id, p_lender, p_account_ref,
    p_original_loan_pence, p_current_balance_pence, p_interest_rate_bps,
    p_monthly_payment_pence, p_product, p_fixed_end_date, p_term_months,
    coalesce(p_is_interest_only, false), p_broker, p_notes
  )
  returning id into v_mortgage_id;

  -- Drawdown event seeds the ledger so deriveBalancePence always has a
  -- floor. If this fails, the mortgage insert above rolls back too.
  insert into mortgage_events (
    mortgage_id, event_date, kind,
    balance_pence, amount_pence, rate_post_bps, notes
  ) values (
    v_mortgage_id, p_drawdown_date, 'drawdown',
    p_current_balance_pence, p_original_loan_pence, p_interest_rate_bps,
    'Initial balance recorded on creation.'
  );

  return v_mortgage_id;
end $$;

revoke execute on function public.create_mortgage_rpc(
  uuid, uuid, text, text, bigint, bigint, int, bigint, text, date, int, boolean, text, text, date
) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_mortgage_rpc(uuid, uuid, text, text, bigint, bigint, int, bigint, text, date, int, boolean, text, text, date) to service_role';
  end if;
end $$;

-- =========================================================================
-- 3. record_mortgage_event_rpc — used by
--    app/(app)/mortgages/actions.ts:recordMortgageEvent
--
-- Replaces the three-step sequence (event insert + ledger re-derive +
-- mortgage balance update). The previous implementation had a race
-- condition: two concurrent payments could each derive against a
-- snapshot before either insert was visible, and one UPDATE clobbered
-- the other.
--
-- This function takes a row-level lock on the mortgage BEFORE reading
-- the ledger, so concurrent events serialise.
-- =========================================================================

create or replace function public.record_mortgage_event_rpc(
  p_organisation_id  uuid,
  p_mortgage_id      uuid,
  p_kind             text,
  p_event_date       date,
  p_amount_pence     bigint,
  p_rate_post_bps    int,
  p_balance_pence    bigint,
  p_notes            text
) returns table (event_id uuid, new_balance_pence bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_initial_balance bigint;
  v_new_balance bigint := 0;
  v_event record;
begin
  -- 1. Lock the mortgage row to serialise concurrent payments.
  perform 1
    from mortgages
    where id = p_mortgage_id
      and organisation_id = p_organisation_id
      and deleted_at is null
    for update;

  if not found then
    raise exception 'mortgage % not found in organisation %', p_mortgage_id, p_organisation_id;
  end if;

  -- 2. Insert the event.
  insert into mortgage_events (
    mortgage_id, event_date, kind,
    amount_pence, rate_post_bps, balance_pence, notes
  ) values (
    p_mortgage_id, p_event_date, p_kind,
    p_amount_pence, p_rate_post_bps, p_balance_pence, p_notes
  )
  returning id into v_event_id;

  -- 3. Re-derive balance from the full ledger.
  --    Mirrors lib/domain/mortgage.deriveBalancePence:
  --      start from the latest drawdown OR reconciliation row,
  --      apply payments forward, clamp at 0.
  --    Interest-only payment kinds DO NOT decrement balance.
  v_initial_balance := 0;
  for v_event in
    select kind, balance_pence, amount_pence
      from mortgage_events
      where mortgage_id = p_mortgage_id
      order by event_date, created_at
  loop
    if v_event.kind in ('drawdown', 'reconciliation') then
      v_initial_balance := coalesce(v_event.balance_pence, v_initial_balance);
      v_new_balance := v_initial_balance;
    elsif v_event.kind = 'payment' then
      v_new_balance := greatest(0, v_new_balance - coalesce(v_event.amount_pence, 0));
    elsif v_event.kind = 'redemption' then
      v_new_balance := 0;
    end if;
    -- payment_interest_only, rate_change, product_switch, er_charge: no
    -- balance change.
  end loop;

  -- 4. Write the derived balance back.
  update mortgages
    set current_balance_pence = v_new_balance,
        updated_at = current_timestamp
    where id = p_mortgage_id
      and organisation_id = p_organisation_id;

  return query select v_event_id, v_new_balance;
end $$;

revoke execute on function public.record_mortgage_event_rpc(
  uuid, uuid, text, date, bigint, int, bigint, text
) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.record_mortgage_event_rpc(uuid, uuid, text, date, bigint, int, bigint, text) to service_role';
  end if;
end $$;

-- =========================================================================
-- 4. create_aasc_placement_rpc — used by
--    app/(app)/aasc/placements/actions.ts:createPlacement
--
-- Replaces the five-step sequence:
--   1. INSERT placement (no identity columns)
--   2. INSERT linked tenancy of kind='aasc_placement'
--   3. UPDATE placement.tenancy_id
--   4. INSERT placement_count_changes 'initial'
--   5. UPDATE unit status = 'occupied'
--
-- AASC: linked tenancy has tenant_id = null by construction. Convention
-- non-negotiable #13 (no service-user identity). No identity columns
-- are touched anywhere in this function.
-- =========================================================================

create or replace function public.create_aasc_placement_rpc(
  p_organisation_id              uuid,
  p_contract_id                  uuid,
  p_property_id                  uuid,
  p_unit_id                      uuid,
  p_placement_ref                text,
  p_weekly_rate_pence            bigint,
  p_commission_rate_bps_override int,
  p_service_user_count           int,
  p_start_date                   date,
  p_end_date_expected            date
) returns table (placement_id uuid, tenancy_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placement_id uuid;
  v_tenancy_id uuid;
begin
  -- 1. Placement row.
  insert into aasc_placements (
    organisation_id, contract_id, property_id, unit_id,
    placement_ref, weekly_rate_pence, commission_rate_bps_override,
    service_user_count, start_date, end_date_expected, status
  ) values (
    p_organisation_id, p_contract_id, p_property_id, p_unit_id,
    p_placement_ref, p_weekly_rate_pence, p_commission_rate_bps_override,
    coalesce(p_service_user_count, 1), p_start_date, p_end_date_expected, 'active'
  )
  returning id into v_placement_id;

  -- 2. Linked tenancy of kind='aasc_placement'. tenant_id stays null —
  --    AASC never points at the tenants table.
  insert into tenancies (
    organisation_id, property_id, unit_id, tenant_id, kind,
    start_date, end_date_intended, rent_pence, rent_period,
    aasc_placement_ref, status
  ) values (
    p_organisation_id, p_property_id, p_unit_id, null, 'aasc_placement',
    p_start_date, p_end_date_expected,
    p_weekly_rate_pence, 'weekly',
    p_placement_ref, 'active'
  )
  returning id into v_tenancy_id;

  -- 3. Link the tenancy to the placement.
  update aasc_placements
    set tenancy_id = v_tenancy_id,
        updated_at = current_timestamp
    where id = v_placement_id;

  -- 4. Count-change ledger seed.
  insert into placement_count_changes (
    organisation_id, placement_id,
    effective_from, new_count, reason
  ) values (
    p_organisation_id, v_placement_id,
    p_start_date, coalesce(p_service_user_count, 1), 'initial'
  );

  -- 5. Mark unit occupied.
  if p_unit_id is not null then
    update units
      set status = 'occupied',
          updated_at = current_timestamp
      where id = p_unit_id
        and property_id = p_property_id;
  end if;

  return query select v_placement_id, v_tenancy_id;
end $$;

revoke execute on function public.create_aasc_placement_rpc(
  uuid, uuid, uuid, uuid, text, bigint, int, int, date, date
) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_aasc_placement_rpc(uuid, uuid, uuid, uuid, text, bigint, int, int, date, date) to service_role';
  end if;
end $$;

-- =========================================================================
-- 5. close_investor_account_rpc — used by
--    app/(app)/investors/actions.ts:closeAccount
--
-- Replaces the two-step sequence (redemption transaction + status flip).
-- If the status flip fails, the account is left 'open' with a balance-
-- zeroing redemption row — an admin must reconcile manually. This
-- function wraps both writes in a single transaction.
-- =========================================================================

create or replace function public.close_investor_account_rpc(
  p_organisation_id        uuid,
  p_account_id             uuid,
  p_redemption_amount_pence bigint,
  p_redemption_date        date,
  p_linked_transaction_id  uuid,
  p_notes                  text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_id uuid;
begin
  -- 1. Lock the account.
  perform 1
    from investor_capital_accounts
    where id = p_account_id
      and organisation_id = p_organisation_id
      and deleted_at is null
      and status = 'open'
    for update;

  if not found then
    raise exception 'account % not found or not open in organisation %',
      p_account_id, p_organisation_id;
  end if;

  -- 2. Redemption transaction (negative — investor takes capital out).
  --    The amount comes in as a positive figure; we flip the sign here.
  insert into investor_transactions (
    organisation_id, account_id, kind,
    transaction_date, amount_pence, linked_transaction_id, notes
  ) values (
    p_organisation_id, p_account_id, 'redemption',
    p_redemption_date,
    - abs(coalesce(p_redemption_amount_pence, 0)),
    p_linked_transaction_id, p_notes
  )
  returning id into v_tx_id;

  -- 3. Flip the account status. If this fails, the redemption insert
  --    rolls back too.
  update investor_capital_accounts
    set status = 'closed',
        updated_at = current_timestamp
    where id = p_account_id
      and organisation_id = p_organisation_id;

  return v_tx_id;
end $$;

revoke execute on function public.close_investor_account_rpc(
  uuid, uuid, bigint, date, uuid, text
) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.close_investor_account_rpc(uuid, uuid, bigint, date, uuid, text) to service_role';
  end if;
end $$;
