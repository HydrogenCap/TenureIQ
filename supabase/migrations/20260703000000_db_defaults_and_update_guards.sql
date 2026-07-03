-- =========================================================================
-- DB defaults + update-path guards (post-review, 2026-07-03)
--
-- 1. Prisma generates id / updated_at values CLIENT-side (@default(uuid()),
--    @updatedAt), so the SQL schema has no column defaults. But the app's
--    user-facing writes go through supabase-js, which supplies neither —
--    e.g. createOrganisation inserts only name/slug/owner_user_id and
--    would fail with a NOT NULL violation on a cleanly-migrated database.
--    Add DB defaults (gen_random_uuid() / current_timestamp) and a
--    BEFORE UPDATE trigger that maintains updated_at.
--
-- 2. The 20260702 parent-org RESTRICTIVE policies covered INSERT only;
--    an UPDATE could still repoint a child row's FK at another org's
--    parent. Add matching FOR UPDATE ... WITH CHECK policies.
-- =========================================================================

set search_path = public;

-- =========================================================================
-- 1a. id defaults: every public table whose uuid id column has no default.
-- =========================================================================

do $$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name = 'id'
      and c.data_type = 'uuid'
      and c.column_default is null
  loop
    execute format('alter table %I alter column id set default gen_random_uuid()', r.table_name);
  end loop;
end $$;

-- =========================================================================
-- 1b. updated_at: default + maintenance trigger. Prisma's @updatedAt also
--     sets the value client-side; the trigger simply wins on every update,
--     which keeps supabase-js and Prisma writes consistent.
-- =========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.updated_at := current_timestamp;
  return NEW;
end $$;

do $$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name = 'updated_at'
  loop
    if (select column_default from information_schema.columns
        where table_schema = 'public' and table_name = r.table_name
          and column_name = 'updated_at') is null then
      execute format('alter table %I alter column updated_at set default current_timestamp', r.table_name);
    end if;
    execute format('drop trigger if exists set_updated_at on %I', r.table_name);
    execute format('create trigger set_updated_at before update on %I
                    for each row execute function public.set_updated_at()', r.table_name);
  end loop;
end $$;

-- created_at safety net (Prisma emits DEFAULT CURRENT_TIMESTAMP for
-- @default(now()), so this is normally a no-op).
do $$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name = 'created_at'
      and c.column_default is null
  loop
    execute format('alter table %I alter column created_at set default current_timestamp', r.table_name);
  end loop;
end $$;

-- =========================================================================
-- 2. Parent-org consistency on the UPDATE path (mirrors the 20260702
--    INSERT policies; service role bypasses RLS so jobs are unaffected).
-- =========================================================================

drop policy if exists "rent_changes_parent_org_upd_ck" on rent_changes;
create policy "rent_changes_parent_org_upd_ck" on rent_changes
  as restrictive for update with check (
    tenancy_id in (select id from tenancies where organisation_id = rent_changes.organisation_id)
  );

drop policy if exists "maintenance_job_events_parent_org_upd_ck" on maintenance_job_events;
create policy "maintenance_job_events_parent_org_upd_ck" on maintenance_job_events
  as restrictive for update with check (
    job_id in (select id from maintenance_jobs where organisation_id = maintenance_job_events.organisation_id)
  );

drop policy if exists "maintenance_quotes_parent_org_upd_ck" on maintenance_quotes;
create policy "maintenance_quotes_parent_org_upd_ck" on maintenance_quotes
  as restrictive for update with check (
    job_id in (select id from maintenance_jobs where organisation_id = maintenance_quotes.organisation_id)
    and (contractor_id is null or contractor_id in
      (select id from contractors where organisation_id = maintenance_quotes.organisation_id))
  );

drop policy if exists "maintenance_invoices_parent_org_upd_ck" on maintenance_invoices;
create policy "maintenance_invoices_parent_org_upd_ck" on maintenance_invoices
  as restrictive for update with check (
    job_id in (select id from maintenance_jobs where organisation_id = maintenance_invoices.organisation_id)
    and (contractor_id is null or contractor_id in
      (select id from contractors where organisation_id = maintenance_invoices.organisation_id))
  );

drop policy if exists "placement_count_changes_parent_org_upd_ck" on placement_count_changes;
create policy "placement_count_changes_parent_org_upd_ck" on placement_count_changes
  as restrictive for update with check (
    placement_id in (select id from aasc_placements where organisation_id = placement_count_changes.organisation_id)
  );

drop policy if exists "investor_transactions_parent_org_upd_ck" on investor_transactions;
create policy "investor_transactions_parent_org_upd_ck" on investor_transactions
  as restrictive for update with check (
    account_id in (select id from investor_capital_accounts where organisation_id = investor_transactions.organisation_id)
  );

drop policy if exists "transaction_import_rows_parent_org_upd_ck" on transaction_import_rows;
create policy "transaction_import_rows_parent_org_upd_ck" on transaction_import_rows
  as restrictive for update with check (
    import_id in (select id from transaction_imports where organisation_id = transaction_import_rows.organisation_id)
    and (property_id is null or property_id in
      (select id from properties where organisation_id = transaction_import_rows.organisation_id))
  );

drop policy if exists "transactions_parent_org_upd_ck" on transactions;
create policy "transactions_parent_org_upd_ck" on transactions
  as restrictive for update with check (
    (bank_account_id is null or bank_account_id in
      (select id from bank_accounts where organisation_id = transactions.organisation_id))
    and (property_id is null or property_id in
      (select id from properties where organisation_id = transactions.organisation_id))
    and (entity_id is null or entity_id in
      (select id from entities where organisation_id = transactions.organisation_id))
  );
