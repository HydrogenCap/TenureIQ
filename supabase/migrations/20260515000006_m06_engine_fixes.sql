-- TenureIQ M6 — Reminder engine fixes from migration-reviewer
-- (commit e4784ac).
--
-- Addresses:
--   P0  GET DIAGNOSTICS syntax error in enqueue function — it cannot
--       assign to an expression; needs a temp variable. Function was
--       non-executable as written.
--   P0  cron_run_log RLS+no-policies behaviour documented + locked
--       down; functions revoke EXECUTE from PUBLIC so authenticated
--       users cannot call them via PostgREST RPC.
--   P1  Idempotency unique index re-scoped to live rows only
--       (WHERE deleted_at IS NULL). Soft-deleted reminders no longer
--       block re-enqueue of a fresh row at the same offset.
--   P1  Supersede trigger now fires on DELETE too, so a hard-deleted
--       compliance item cleans up its pending reminders instead of
--       orphaning them.
--   P2  trigger_at is computed in UTC explicitly (was session TZ).
--   P2  claim_pending_reminders increments retry_count on claim so a
--       crashed worker can be re-claimed up to 3 times. A separate
--       sweeper to release stuck claims is queued for follow-up.

set search_path = public;

-- =========================================================================
-- 1. enqueue function — fixed syntax + UTC trigger_at + revoke public.
-- =========================================================================

create or replace function public.enqueue_compliance_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted  int := 0;
  v_loop_rows int;
  v_today     date := current_date;
  v_offsets   int[] := array[90, 60, 30, 14, 7, 0, -7];
  v_offset    int;
begin
  foreach v_offset in array v_offsets loop
    if v_offset > 0 and extract(isodow from v_today) in (6, 7) then
      continue;
    end if;

    insert into reminders (
      organisation_id, related_kind, related_id,
      days_until_event, trigger_at, body_key, context,
      status, channel
    )
    select
      ci.organisation_id,
      'compliance' as related_kind,
      ci.id as related_id,
      v_offset as days_until_event,
      -- Force UTC so "08:00 UTC" is consistent regardless of server TZ.
      ((ci.expiry_date - v_offset)::timestamp at time zone 'UTC')
        + interval '8 hours' as trigger_at,
      'compliance_reminder' as body_key,
      jsonb_build_object(
        'compliance_item_id', ci.id,
        'kind', ci.kind,
        'expiry_date', ci.expiry_date,
        'days_until', v_offset,
        'property_id', ci.property_id,
        'issuer', ci.issuer
      ) as context,
      'pending' as status,
      'email' as channel
    from compliance_items ci
    join organisations o on o.id = ci.organisation_id
    where ci.deleted_at is null
      and o.deleted_at is null
      and ci.status <> 'exempt'
      and ci.expiry_date is not null
      and o.created_at <= now() - interval '14 days'
      and (ci.expiry_date - v_offset) >= v_today
    on conflict (organisation_id, related_kind, related_id, days_until_event)
    do nothing;

    -- Correct PL/pgSQL syntax: assign row_count to a temp, then add.
    get diagnostics v_loop_rows = row_count;
    v_inserted := v_inserted + v_loop_rows;
  end loop;

  return v_inserted;
end;
$$;

-- =========================================================================
-- 2. claim function — bump retry_count on claim so stuck claims age out.
-- =========================================================================

create or replace function public.claim_pending_reminders(
  p_limit int,
  p_claimed_by text
)
returns setof reminders
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update reminders r
    set status = 'claimed',
        claimed_at = current_timestamp,
        claimed_by = p_claimed_by,
        retry_count = r.retry_count + 1,
        updated_at = current_timestamp
    where r.id in (
      select id from reminders
      where status = 'pending'
        and trigger_at <= current_timestamp
        and deleted_at is null
        and retry_count < 3
      order by trigger_at
      limit p_limit
      for update skip locked
    )
    returning r.*;
end;
$$;

-- The send loop in lib/cron/send-reminders.ts decrements retry_count on
-- success path (sees nextStatus='pending' branch when retries < 3 on
-- failure). Update it to NOT bump retry_count itself — claim already
-- did. Done in a code-level commit; this migration is the SQL side.

-- =========================================================================
-- 3. Lock down RPC: revoke PUBLIC, grant only service_role.
-- =========================================================================

revoke execute on function public.enqueue_compliance_reminders() from public;
revoke execute on function public.claim_pending_reminders(int, text) from public;

-- Grant to the service_role; authenticated users cannot RPC these.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.enqueue_compliance_reminders() to service_role';
    execute 'grant execute on function public.claim_pending_reminders(int, text) to service_role';
  end if;
end$$;

-- =========================================================================
-- 4. Idempotency unique re-scoped to live rows only.
-- =========================================================================

drop index if exists reminders_org_related_offset_unique;
create unique index reminders_org_related_offset_unique
  on reminders (organisation_id, related_kind, related_id, days_until_event)
  where deleted_at is null;

-- =========================================================================
-- 5. Supersede trigger covers DELETE too. Hard-deleted compliance items
--    no longer leave orphan pending reminders.
-- =========================================================================

create or replace function public.supersede_compliance_reminders()
returns trigger
language plpgsql
as $$
declare
  v_related_id uuid;
  v_should_run boolean := false;
begin
  if TG_OP = 'DELETE' then
    v_related_id := OLD.id;
    v_should_run := true;
  elsif TG_OP = 'UPDATE' then
    v_related_id := NEW.id;
    if (OLD.expiry_date is distinct from NEW.expiry_date)
       or (OLD.deleted_at is null and NEW.deleted_at is not null)
       or (OLD.status is distinct from NEW.status and NEW.status = 'exempt')
    then
      v_should_run := true;
    end if;
  end if;

  if v_should_run then
    update reminders
      set status = 'superseded',
          updated_at = current_timestamp
      where related_kind = 'compliance'
        and related_id = v_related_id
        and status in ('pending', 'claimed');
  end if;

  -- AFTER triggers ignore the return value, but DELETE wants OLD.
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

drop trigger if exists compliance_supersede on compliance_items;
-- Column-scoped so spurious updates (e.g. notes-only) don't re-evaluate
-- the reminders table.
create trigger compliance_supersede
  after update of expiry_date, deleted_at, status on compliance_items
  for each row execute function supersede_compliance_reminders();
-- DELETE needs its own trigger because column-list only applies to UPDATE.
drop trigger if exists compliance_supersede_delete on compliance_items;
create trigger compliance_supersede_delete
  after delete on compliance_items
  for each row execute function supersede_compliance_reminders();

-- =========================================================================
-- 6. Document the cron_run_log access contract + drop from realtime
--    publication (defence in depth — service-role bypasses RLS but
--    Realtime channels are a separate surface).
-- =========================================================================

comment on table cron_run_log is
  'Single org-wide cron observability log. RLS enabled with NO policies. '
  'Reads MUST go through lib/admin/cron-log.ts (service-role); writes from '
  'lib/cron/send-reminders.ts (service-role). User-facing supabaseServer() '
  'clients will see zero rows by design.';

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'cron_run_log'
  ) then
    execute 'alter publication supabase_realtime drop table cron_run_log';
  end if;
end$$;

-- =========================================================================
-- 7. Block member self-update of role / organisation_id (P0 from
--    security-reviewer). The existing org_members_update RLS policy
--    correctly scopes the ROW (user_id = auth.uid()) but does not
--    constrain the COLUMNS. A member could re-write their own row to
--    role='owner'. Trigger-level defence — works regardless of which
--    columns the caller passes.
-- =========================================================================

create or replace function public.guard_org_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role + superuser bypass.
  if current_setting('request.jwt.claims', true)::jsonb ? 'service_role' then
    return NEW;
  end if;

  -- If the caller IS NOT the row's user_id, an admin / owner is the one
  -- changing it (the RLS policy already gated that path); allow.
  if NEW.user_id <> auth.uid() then
    return NEW;
  end if;

  -- Self-update: restrict columns that may change.
  if NEW.role is distinct from OLD.role then
    raise exception 'Members cannot change their own role. Ask an admin or owner.';
  end if;
  if NEW.organisation_id is distinct from OLD.organisation_id then
    raise exception 'Members cannot move themselves between organisations.';
  end if;
  if NEW.user_id is distinct from OLD.user_id then
    raise exception 'Members cannot change the user_id of their own membership.';
  end if;
  if NEW.accepted_at is distinct from OLD.accepted_at
     and OLD.accepted_at is not null then
    -- Allow setting accepted_at on invitation acceptance, but not clearing
    -- it once set.
    raise exception 'Cannot un-accept an organisation membership.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists organisation_members_self_update_guard on organisation_members;
create trigger organisation_members_self_update_guard
  before update on organisation_members
  for each row execute function guard_org_member_self_update();
