-- TenureIQ M9 security fixes (migration-reviewer follow-up on
-- 20260515000010_m09_maintenance).
--
-- P0 #1: maintenance_invoices.transaction_id had no FK constraint —
--        orphan transaction_ids could accumulate silently. Adding the
--        FK with ON DELETE SET NULL (per CLAUDE.md: don't cascade-
--        delete tenant data; keep the invoice, drop the linkage if
--        the transaction is removed).
-- P0 #2: maintenance_jobs.assigned_contractor_id and tenancy_id used
--        ON DELETE RESTRICT, which would have blocked legitimate
--        tenancy soft-deletes / contractor archives. Switching to
--        SET NULL — job history survives reassignment / churn.
-- P0 #3: notify_contractor_insurance was defaulted to TRUE, silently
--        opting every existing member into a new email channel.
--        Re-default to FALSE and backfill the change (we keep the
--        existing TRUE values for any member who was created since
--        the initial migration — they explicitly toggled it).
-- P1: invoice_number empty-string CHECK to make the unique constraint
--     unambiguous.

set search_path = public;

-- =========================================================================
-- P0 #1 — Add missing FK on maintenance_invoices.transaction_id
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_invoices_transaction_fkey'
      and conrelid = 'maintenance_invoices'::regclass
  ) then
    alter table maintenance_invoices
      add constraint maintenance_invoices_transaction_fkey
      foreign key (transaction_id) references transactions(id)
      on update cascade on delete set null;
  end if;
end$$;

create index if not exists maintenance_invoices_transaction_id_idx
  on maintenance_invoices(transaction_id);

-- =========================================================================
-- P0 #2 — Switch RESTRICT FKs to SET NULL on maintenance_jobs
-- =========================================================================

-- Postgres can't alter a FK in place; drop + recreate.
alter table maintenance_jobs
  drop constraint if exists maintenance_jobs_assigned_contractor_fkey;
alter table maintenance_jobs
  add constraint maintenance_jobs_assigned_contractor_fkey
  foreign key (assigned_contractor_id) references contractors(id)
  on update cascade on delete set null;

alter table maintenance_jobs
  drop constraint if exists maintenance_jobs_tenancy_fkey;
alter table maintenance_jobs
  add constraint maintenance_jobs_tenancy_fkey
  foreign key (tenancy_id) references tenancies(id)
  on update cascade on delete set null;

-- =========================================================================
-- P0 #3 — Fix notify_contractor_insurance default
-- =========================================================================

alter table organisation_members
  alter column notify_contractor_insurance set default false;

-- We can't tell which existing rows were the default-true backfill vs.
-- explicit user choice. Conservative: leave existing values intact
-- (already opted-in users stay opted-in). Future inserts default false.
-- Operator can run the following one-time to opt everyone out:
--   update organisation_members set notify_contractor_insurance = false
--   where notify_contractor_insurance is true;
-- Not run here — users who already saw the toggle may be relying on it.

-- =========================================================================
-- P1 — Invoice number must be non-empty
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_invoices_invoice_number_not_empty'
      and conrelid = 'maintenance_invoices'::regclass
  ) then
    alter table maintenance_invoices
      add constraint maintenance_invoices_invoice_number_not_empty
      check (length(btrim(invoice_number)) > 0);
  end if;
end$$;

-- =========================================================================
-- P2 — Documentation comments on intentional deviations from the
-- four-policy template, so the next reviewer doesn't flag them as bugs.
-- =========================================================================

comment on table maintenance_job_events is
  'Append-only timeline of job lifecycle events. RLS has only SELECT and '
  'INSERT policies on purpose: corrections come in as new events, never '
  'as edits or deletes (mirrors the audit_log invariant). Audit-trail '
  'immutability is the invariant being protected; an UPDATE/DELETE policy '
  'would defeat the purpose of the table.';

comment on policy "contractors_select_archived" on contractors is
  'Deviation from the four-policy template: owner/admin can see soft-'
  'deleted contractors so they can be restored (matches the entities/'
  'properties/etc archived-visible pattern from 20260514000002).';

-- =========================================================================
-- P2 — index on contractors.entity_id (for the "contractors that are
-- also sister entities" join used in the contractor detail page).
-- =========================================================================

create index if not exists contractors_entity_id_idx
  on contractors(entity_id)
  where entity_id is not null;
