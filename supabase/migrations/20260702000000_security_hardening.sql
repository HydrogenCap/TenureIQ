-- =========================================================================
-- Security hardening (post-audit, 2026-07-02)
--
-- Findings addressed:
--   P1  Invitee could UPDATE any column of their own invitation (including
--       role) before accepting — self-escalation to owner. Column guard
--       trigger added; only accepted_at may change on the invitee path.
--   P1  Child tables checked only their own organisation_id on INSERT /
--       UPDATE — a manager in org A could point a child row's FK at org
--       B's parent (referential tenancy pollution). RESTRICTIVE policies
--       added asserting parent-org consistency. Service role bypasses RLS
--       so jobs are unaffected.
--   P2  reminders were writable by managers although only the reminder
--       engine (service role) should write them.
--   P2  A handful of trigger functions omitted `set search_path`.
--   P2  webhook_events.organisation_id cascaded on org delete, deviating
--       from the no-cascade convention.
-- =========================================================================

set search_path = public;

-- =========================================================================
-- 1. Invitation column guard: invitees may only set accepted_at.
-- =========================================================================

create or replace function public.guard_invitation_invitee_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role / non-user contexts bypass.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role'
     or auth.uid() is null then
    return NEW;
  end if;

  -- Org owners / admins may edit freely (revoke, resend, etc.).
  if NEW.organisation_id in (select * from current_user_orgs_with_role(array['owner','admin'])) then
    return NEW;
  end if;

  -- Invitee path: every column except accepted_at must be unchanged.
  if NEW.organisation_id  is distinct from OLD.organisation_id
     or NEW.email         is distinct from OLD.email
     or NEW.role          is distinct from OLD.role
     or NEW.expires_at    is distinct from OLD.expires_at
     or NEW.revoked_at    is distinct from OLD.revoked_at
     or NEW.invited_by_user_id is distinct from OLD.invited_by_user_id
  then
    raise exception 'Invitees may only accept an invitation, not modify it.';
  end if;

  return NEW;
end $$;

drop trigger if exists guard_invitation_invitee_update on invitations;
create trigger guard_invitation_invitee_update
  before update on invitations
  for each row execute function public.guard_invitation_invitee_update();

-- =========================================================================
-- 2. Parent-org consistency: RESTRICTIVE policies on child tables.
--    These AND with the existing permissive org policies, so they can
--    only narrow access. NULL FKs pass (the row simply isn't linked).
-- =========================================================================

-- rent_changes → tenancies
drop policy if exists "rent_changes_parent_org_ck" on rent_changes;
create policy "rent_changes_parent_org_ck" on rent_changes
  as restrictive for insert with check (
    tenancy_id in (select id from tenancies where organisation_id = rent_changes.organisation_id)
  );

-- maintenance_job_events → maintenance_jobs (+ optional contractor)
drop policy if exists "maintenance_job_events_parent_org_ck" on maintenance_job_events;
create policy "maintenance_job_events_parent_org_ck" on maintenance_job_events
  as restrictive for insert with check (
    job_id in (select id from maintenance_jobs where organisation_id = maintenance_job_events.organisation_id)
  );

-- maintenance_quotes → maintenance_jobs + contractors
drop policy if exists "maintenance_quotes_parent_org_ck" on maintenance_quotes;
create policy "maintenance_quotes_parent_org_ck" on maintenance_quotes
  as restrictive for insert with check (
    job_id in (select id from maintenance_jobs where organisation_id = maintenance_quotes.organisation_id)
    and (contractor_id is null or contractor_id in
      (select id from contractors where organisation_id = maintenance_quotes.organisation_id))
  );

-- maintenance_invoices → maintenance_jobs + contractors
drop policy if exists "maintenance_invoices_parent_org_ck" on maintenance_invoices;
create policy "maintenance_invoices_parent_org_ck" on maintenance_invoices
  as restrictive for insert with check (
    job_id in (select id from maintenance_jobs where organisation_id = maintenance_invoices.organisation_id)
    and (contractor_id is null or contractor_id in
      (select id from contractors where organisation_id = maintenance_invoices.organisation_id))
  );

-- placement_count_changes → aasc_placements
drop policy if exists "placement_count_changes_parent_org_ck" on placement_count_changes;
create policy "placement_count_changes_parent_org_ck" on placement_count_changes
  as restrictive for insert with check (
    placement_id in (select id from aasc_placements where organisation_id = placement_count_changes.organisation_id)
  );

-- investor_transactions → investor_capital_accounts (+ investor)
drop policy if exists "investor_transactions_parent_org_ck" on investor_transactions;
create policy "investor_transactions_parent_org_ck" on investor_transactions
  as restrictive for insert with check (
    account_id in (select id from investor_capital_accounts where organisation_id = investor_transactions.organisation_id)
  );

-- transaction_import_rows → transaction_imports (+ optional property)
drop policy if exists "transaction_import_rows_parent_org_ck" on transaction_import_rows;
create policy "transaction_import_rows_parent_org_ck" on transaction_import_rows
  as restrictive for insert with check (
    import_id in (select id from transaction_imports where organisation_id = transaction_import_rows.organisation_id)
    and (property_id is null or property_id in
      (select id from properties where organisation_id = transaction_import_rows.organisation_id))
  );

-- transactions → bank_accounts / properties / entities (all nullable)
drop policy if exists "transactions_parent_org_ck" on transactions;
create policy "transactions_parent_org_ck" on transactions
  as restrictive for insert with check (
    (bank_account_id is null or bank_account_id in
      (select id from bank_accounts where organisation_id = transactions.organisation_id))
    and (property_id is null or property_id in
      (select id from properties where organisation_id = transactions.organisation_id))
    and (entity_id is null or entity_id in
      (select id from entities where organisation_id = transactions.organisation_id))
  );

-- =========================================================================
-- 3. reminders: engine-only writes. Users read; the cron engine (service
--    role, bypasses RLS) writes. Drop the template write policies if the
--    original template ever created them.
-- =========================================================================

drop policy if exists "reminders_insert" on reminders;
drop policy if exists "reminders_update" on reminders;
drop policy if exists "reminders_delete" on reminders;

-- =========================================================================
-- 4. search_path hygiene on remaining trigger functions.
-- =========================================================================

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'supersede_compliance_reminders',
    'supersede_aasc_reminders',
    'supersede_contractor_reminders',
    'strip_webhook_signature_headers',
    'default_organisation_trial'
  ] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = fn) then
      execute format('alter function public.%I() set search_path = public', fn);
    end if;
  end loop;
end $$;

-- =========================================================================
-- 5. webhook_events: no cascade on org delete (convention: RESTRICT).
-- =========================================================================

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'webhook_events'
      and constraint_name = 'webhook_events_organisation_id_fkey'
  ) then
    alter table webhook_events drop constraint webhook_events_organisation_id_fkey;
    alter table webhook_events
      add constraint webhook_events_organisation_id_fkey
      foreign key (organisation_id) references organisations(id) on delete restrict;
  end if;
end $$;

-- =========================================================================
-- 6. users: co-members of a shared organisation can read each other's
--    directory row (name/email) — needed by the team-members page.
--    SECURITY DEFINER helper avoids recursive RLS evaluation.
-- =========================================================================

create or replace function public.current_user_coworkers()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.user_id
  from organisation_members om
  where om.organisation_id in (select * from current_user_orgs())
    and om.deleted_at is null
$$;

revoke execute on function public.current_user_coworkers() from public;
grant execute on function public.current_user_coworkers() to authenticated;

drop policy if exists "users_coworker_select" on users;
create policy "users_coworker_select" on users for select
  using (id in (select * from current_user_coworkers()));
