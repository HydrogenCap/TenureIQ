-- TenureIQ M3 — migration-reviewer follow-ups.
--
-- Addresses P0 + P1 findings on 20260515000000_m03_tenancies_units:
--   P0  rent_changes missing deleted_at + updated_at; RLS lacked soft-delete
--       predicate (convention #6 — soft-delete everywhere).
--   P0  tenancy_tenants.tenancy_id had ON DELETE CASCADE — convention
--       forbids cascade-delete on tenant data. Change to RESTRICT and
--       rely on tenancies.deleted_at for soft-cleanup; admin tooling
--       under lib/admin/* is the only path that should ever hard-delete
--       a tenancy, and it can hard-delete the joins first explicitly.
--   P0  tenancy_tenants.tenant_id had no explicit ON DELETE — set to
--       RESTRICT for clarity.
--   P1  tenancy_tenants mutation policies (insert/update/delete) did not
--       check the parent tenancy's deleted_at. A soft-deleted tenancy
--       could still have its joins mutated.

set search_path = public;

-- =========================================================================
-- 1. rent_changes — add deleted_at + updated_at to match the convention.
-- =========================================================================

alter table rent_changes
  add column if not exists updated_at timestamptz(6) not null default current_timestamp,
  add column if not exists deleted_at timestamptz(6);

create index if not exists rent_changes_organisation_deleted_idx
  on rent_changes (organisation_id, deleted_at);

-- Replace the select policy so it filters out soft-deleted rows.
drop policy if exists "rent_changes_select" on rent_changes;
create policy "rent_changes_select" on rent_changes
  for select using (
    organisation_id in (select * from current_user_orgs())
    and deleted_at is null
  );

-- Owner/admin can still see archived rows (mirrors the 20260514000002 pattern).
drop policy if exists "rent_changes_select_archived" on rent_changes;
create policy "rent_changes_select_archived" on rent_changes
  for select using (
    deleted_at is not null
    and organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

-- =========================================================================
-- 2. tenancy_tenants — replace ON DELETE behaviour on both FKs.
-- =========================================================================

alter table tenancy_tenants drop constraint if exists tenancy_tenants_tenancy_id_fkey;
alter table tenancy_tenants
  add constraint tenancy_tenants_tenancy_id_fkey
  foreign key (tenancy_id) references tenancies(id)
  on update cascade on delete restrict;

alter table tenancy_tenants drop constraint if exists tenancy_tenants_tenant_id_fkey;
alter table tenancy_tenants
  add constraint tenancy_tenants_tenant_id_fkey
  foreign key (tenant_id) references tenants(id)
  on update cascade on delete restrict;

-- =========================================================================
-- 3. tenancy_tenants — mutation policies check parent.deleted_at.
-- =========================================================================

drop policy if exists "tenancy_tenants_insert" on tenancy_tenants;
create policy "tenancy_tenants_insert" on tenancy_tenants
  for insert with check (
    tenancy_id in (
      select id from tenancies
      where organisation_id in (
        select * from current_user_orgs_with_role(array['owner','admin','manager'])
      )
      and deleted_at is null
    )
  );

drop policy if exists "tenancy_tenants_update" on tenancy_tenants;
create policy "tenancy_tenants_update" on tenancy_tenants
  for update using (
    tenancy_id in (
      select id from tenancies
      where organisation_id in (
        select * from current_user_orgs_with_role(array['owner','admin','manager'])
      )
      and deleted_at is null
    )
  ) with check (
    tenancy_id in (
      select id from tenancies
      where organisation_id in (
        select * from current_user_orgs_with_role(array['owner','admin','manager'])
      )
      and deleted_at is null
    )
  );

drop policy if exists "tenancy_tenants_delete" on tenancy_tenants;
create policy "tenancy_tenants_delete" on tenancy_tenants
  for delete using (
    tenancy_id in (
      select id from tenancies
      where organisation_id in (
        select * from current_user_orgs_with_role(array['owner','admin'])
      )
      and deleted_at is null
    )
  );
