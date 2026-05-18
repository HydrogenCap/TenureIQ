-- M5 bank CSV import — review follow-ups for migration 20260515000017.
--
-- Addresses migration-reviewer + security-reviewer findings:
--
--   P0  Add missing `import_batch_id` column + index on transactions.
--       The 17 RPC writes to this column; without it, every commit fails.
--   P0  Add updated_at + deleted_at to transaction_import_rows so the
--       table matches the soft-delete + audit conventions.
--   P0  Tighten the select policy to filter deleted_at is null.
--   P0  Update commit_bank_import_rpc:
--           - FOR UPDATE on the staged rows it about to consume
--             (defends against concurrent skip-toggles racing the commit).
--           - re-validate bank_account.organisation_id === p_organisation_id
--             as defence-in-depth even though RLS would block earlier.
--           - bump updated_at on row + import on commit.
--   P1  Add audit trigger on transaction_import_rows — they carry the
--       editable category + property assignment that drives the live
--       transaction inserts.
--   P2  Partial index on transactions(import_batch_id) for the
--       "transactions originating from import X" lookup.

set search_path = public;

-- =========================================================================
-- 1. transactions.import_batch_id — the missing column
-- =========================================================================
alter table transactions
  add column if not exists import_batch_id uuid;

create index if not exists transactions_import_batch_id_idx
  on transactions (import_batch_id)
  where import_batch_id is not null;

-- =========================================================================
-- 2. transaction_import_rows — add updated_at + deleted_at
-- =========================================================================
alter table transaction_import_rows
  add column if not exists updated_at timestamptz not null default now();

alter table transaction_import_rows
  add column if not exists deleted_at timestamptz;

create index if not exists transaction_import_rows_org_deleted_idx
  on transaction_import_rows (organisation_id, deleted_at);

-- Application code is responsible for bumping updated_at on each
-- update. The commit_bank_import_rpc below sets it on the row + import
-- rows it touches; updateStagedRow in app/(app)/transactions/import/
-- actions.ts does the same.

-- =========================================================================
-- 3. transaction_import_rows — refresh select policy to honour soft-delete
-- =========================================================================
drop policy if exists "transaction_import_rows_select" on transaction_import_rows;
create policy "transaction_import_rows_select" on transaction_import_rows
  for select using (
    organisation_id in (select * from current_user_orgs())
    and deleted_at is null
  );

-- =========================================================================
-- 4. transaction_import_rows — audit trigger
-- =========================================================================
drop trigger if exists transaction_import_rows_audit on transaction_import_rows;
create trigger transaction_import_rows_audit
  after insert or update or delete on transaction_import_rows
  for each row execute function audit_log_trigger();

-- =========================================================================
-- 5. commit_bank_import_rpc — replace with hardened version
-- =========================================================================
-- IMPORTANT: this function must remain restricted to service_role. Granting
-- execute to `authenticated` would let any caller commit any import whose
-- id they could guess by passing the matching org id — RLS does not protect
-- security-definer function bodies.
create or replace function commit_bank_import_rpc(
  p_organisation_id uuid,
  p_import_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_import_org uuid;
  v_import_status text;
  v_bank_account_id uuid;
  v_bank_org uuid;
begin
  -- Serialise concurrent commits of the same batch.
  select organisation_id, status, bank_account_id
    into v_import_org, v_import_status, v_bank_account_id
    from transaction_imports
    where id = p_import_id
      and deleted_at is null
    for update;

  if v_import_org is null then
    raise exception 'import % not found', p_import_id;
  end if;
  if v_import_org <> p_organisation_id then
    raise exception 'import % belongs to a different organisation', p_import_id;
  end if;
  if v_import_status not in ('pending', 'previewing') then
    raise exception 'import % already in terminal state %', p_import_id, v_import_status;
  end if;

  -- Defence-in-depth: the bank_account must still belong to the caller's
  -- org. RLS would have blocked anything else, but a tampered staging
  -- row should not be silently committed.
  select organisation_id into v_bank_org
    from bank_accounts
    where id = v_bank_account_id
      and deleted_at is null;
  if v_bank_org is null then
    raise exception 'bank account % not found', v_bank_account_id;
  end if;
  if v_bank_org <> p_organisation_id then
    raise exception 'bank account % belongs to a different organisation', v_bank_account_id;
  end if;

  -- Lock the staged rows we are about to consume so a concurrent
  -- updateStagedRow can't flip status under us between insert and update.
  perform 1
    from transaction_import_rows
    where import_id = p_import_id
      and organisation_id = p_organisation_id
      and status = 'pending'
      and deleted_at is null
    for update;

  insert into transactions (
    organisation_id, bank_account_id, property_id, posted_at, description,
    amount_pence, category_code, reference, external_id, import_batch_id
  )
  select
    r.organisation_id,
    v_bank_account_id,
    r.property_id,
    r.posted_at,
    r.description,
    r.amount_pence,
    r.category_code,
    r.reference,
    r.external_id,
    p_import_id
  from transaction_import_rows r
  where r.import_id = p_import_id
    and r.organisation_id = p_organisation_id
    and r.status = 'pending'
    and r.deleted_at is null;

  get diagnostics v_inserted = row_count;

  update transaction_import_rows
    set status = 'committed',
        updated_at = now()
    where import_id = p_import_id
      and organisation_id = p_organisation_id
      and status = 'pending'
      and deleted_at is null;

  update transaction_imports
    set status = 'committed',
        committed_at = now(),
        updated_at = now()
    where id = p_import_id
      and organisation_id = p_organisation_id;

  return v_inserted;
end
$$;

revoke all on function commit_bank_import_rpc(uuid, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function commit_bank_import_rpc(uuid, uuid) to service_role';
  end if;
end$$;

comment on function commit_bank_import_rpc(uuid, uuid) is
  'Service-role only. Do not grant to authenticated — see header note in 20260515000018.';
