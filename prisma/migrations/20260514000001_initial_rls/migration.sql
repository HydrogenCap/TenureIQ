-- TenureIQ Row Level Security & audit trigger setup
-- Apply AFTER Prisma migration creates the tables.
-- File naming: timestamp_initial_rls.sql

set search_path = public;

-- =========================================================================
-- 1. CHECK constraints for enum-like text columns (allows easier evolution
--    than Postgres enums; documented as part of the convention).
-- =========================================================================

alter table organisation_members
  add constraint organisation_members_role_check
  check (role in ('owner', 'admin', 'manager', 'accountant', 'viewer'));

alter table invitations
  add constraint invitations_role_check
  check (role in ('owner', 'admin', 'manager', 'accountant', 'viewer'));

alter table entities
  add constraint entities_kind_check
  check (kind in ('ltd', 'llp', 'individual', 'spv'));

alter table properties
  add constraint properties_kind_check
  check (kind in ('hmo', 'single_let', 'block', 'commercial', 'development', 'land'));

alter table properties
  add constraint properties_epc_rating_check
  check (epc_rating is null or epc_rating in ('A','B','C','D','E','F','G'));

alter table properties
  add constraint properties_hmo_licence_kind_check
  check (hmo_licence_kind is null or hmo_licence_kind in ('none','mandatory','additional','selective'));

alter table tenancies
  add constraint tenancies_kind_check
  check (kind in ('ast','licence','aasc_placement','company_let','holiday_let'));

alter table tenancies
  add constraint tenancies_aasc_contractor_check
  check (aasc_contractor is null or aasc_contractor in ('clearsprings','serco'));

alter table mortgages
  add constraint mortgages_product_check
  check (product in ('fixed','tracker','svr','discount','bridging','development'));

alter table valuations
  add constraint valuations_kind_check
  check (kind in ('estimate','estate_agent','red_book','refinance','purchase','desktop'));

alter table compliance_items
  add constraint compliance_items_kind_check
  check (kind in ('gas_safety','eicr','epc','hmo_licence','fire_alarm','emergency_lighting','pat','legionella','insurance','asbestos','fire_risk_assessment','other'));

alter table compliance_items
  add constraint compliance_items_status_check
  check (status in ('valid','expiring','expired','missing','exempt'));

alter table aasc_contracts
  add constraint aasc_contracts_contractor_check
  check (contractor in ('clearsprings','serco'));

alter table aasc_areas
  add constraint aasc_areas_contractor_check
  check (contractor in ('clearsprings','serco'));

alter table aasc_areas
  add constraint aasc_areas_status_check
  check (status is null or status in ('open','limited','closed','unknown'));

alter table lha_rates
  add constraint lha_rates_beds_check
  check (beds in ('SAR','1B','2B','3B','4B'));

-- =========================================================================
-- 2. Helper function: current_user_orgs()
-- =========================================================================

create or replace function public.current_user_orgs()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organisation_id
  from public.organisation_members
  where user_id = auth.uid()
    and accepted_at is not null
    and deleted_at is null
$$;

revoke all on function public.current_user_orgs() from public;
grant execute on function public.current_user_orgs() to authenticated;

create or replace function public.current_user_orgs_with_role(allowed_roles text[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organisation_id
  from public.organisation_members
  where user_id = auth.uid()
    and role = any(allowed_roles)
    and accepted_at is not null
    and deleted_at is null
$$;

revoke all on function public.current_user_orgs_with_role(text[]) from public;
grant execute on function public.current_user_orgs_with_role(text[]) to authenticated;

-- =========================================================================
-- 3. Audit log trigger
-- =========================================================================

create or replace function public.audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_org uuid;
  v_row_id uuid;
begin
  if TG_OP = 'INSERT' then
    v_after := to_jsonb(NEW);
    v_before := null;
    v_row_id := (NEW.id)::uuid;
    begin v_org := (NEW.organisation_id)::uuid; exception when others then v_org := null; end;
  elsif TG_OP = 'UPDATE' then
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_row_id := (NEW.id)::uuid;
    begin v_org := (NEW.organisation_id)::uuid; exception when others then v_org := null; end;
  elsif TG_OP = 'DELETE' then
    v_before := to_jsonb(OLD);
    v_after := null;
    v_row_id := (OLD.id)::uuid;
    begin v_org := (OLD.organisation_id)::uuid; exception when others then v_org := null; end;
  end if;

  insert into public.audit_log (actor_user_id, organisation_id, action, table_name, row_id, before, after)
  values (v_actor, v_org, TG_OP, TG_TABLE_NAME, v_row_id, v_before, v_after);

  return coalesce(NEW, OLD);
end;
$$;

-- =========================================================================
-- 4. RLS — enable on every table, apply policies
-- =========================================================================

-- USERS (mirror of auth.users)
alter table users enable row level security;
create policy "users_self_select" on users for select using (id = auth.uid());

-- ORGANISATIONS
alter table organisations enable row level security;

create policy "organisations_select" on organisations
  for select using (id in (select * from current_user_orgs()) and deleted_at is null);

create policy "organisations_insert" on organisations
  for insert with check (owner_user_id = auth.uid());

create policy "organisations_update" on organisations
  for update using (id in (select * from current_user_orgs_with_role(array['owner','admin'])))
  with check (id in (select * from current_user_orgs_with_role(array['owner','admin'])));

create policy "organisations_delete" on organisations
  for delete using (id in (select * from current_user_orgs_with_role(array['owner'])));

-- ORGANISATION_MEMBERS
alter table organisation_members enable row level security;

create policy "org_members_select" on organisation_members
  for select using (
    organisation_id in (select * from current_user_orgs())
    or user_id = auth.uid()
  );

create policy "org_members_insert" on organisation_members
  for insert with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

create policy "org_members_update" on organisation_members
  for update using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
    or user_id = auth.uid()  -- allow self to accept invitation
  )
  with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
    or user_id = auth.uid()
  );

create policy "org_members_delete" on organisation_members
  for delete using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

-- INVITATIONS
alter table invitations enable row level security;

create policy "invitations_select" on invitations
  for select using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
    or email = (select email from auth.users where id = auth.uid())
  );

create policy "invitations_insert" on invitations
  for insert with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
    and invited_by_user_id = auth.uid()
  );

create policy "invitations_update" on invitations
  for update using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
    or email = (select email from auth.users where id = auth.uid())
  ) with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
    or email = (select email from auth.users where id = auth.uid())
  );

create policy "invitations_delete" on invitations
  for delete using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

-- =========================================================================
-- 5. Four-policy template applied to every tenant-scoped table
-- =========================================================================

-- Macro shorthand: we cannot DO blocks easily in migration, so spelled out per table.
-- The pattern is identical: select members can read undeleted; insert/update by mgr+;
-- delete by owner/admin only.

-- Helper to keep this file readable: a procedural block that applies the standard 4 policies.
do $$
declare
  t text;
  -- NOTE: shareholders, mortgage_events and units are scoped via FK (no
  -- organisation_id column) and reminders has no deleted_at until M6 —
  -- all four get explicit policies below instead of the template.
  tables text[] := array[
    'entities', 'bank_accounts',
    'properties', 'tenants', 'tenancies',
    'mortgages', 'valuations', 'transactions',
    'director_loans', 'investor_capital_accounts',
    'compliance_items', 'maintenance_jobs', 'tasks',
    'documents', 'aasc_contracts', 'aasc_placements'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);

    -- SELECT
    execute format($f$
      create policy "%1$s_select" on %1$I for select
      using (
        organisation_id in (select * from current_user_orgs())
        and (deleted_at is null or current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role')
      )
    $f$, t);

    -- INSERT (managers and above)
    execute format($f$
      create policy "%1$s_insert" on %1$I for insert
      with check (
        organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
      )
    $f$, t);

    -- UPDATE
    execute format($f$
      create policy "%1$s_update" on %1$I for update
      using (
        organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
      )
      with check (
        organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
      )
    $f$, t);

    -- DELETE
    execute format($f$
      create policy "%1$s_delete" on %1$I for delete
      using (
        organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
      )
    $f$, t);
  end loop;
end $$;

-- Special case: shareholders, mortgage_events and units have no
-- organisation_id column — they are scoped via FK to entity / mortgage /
-- property. reminders exists but gains deleted_at only in M6, so its
-- policies are org-scoped without the soft-delete predicate here.

alter table shareholders enable row level security;
alter table mortgage_events enable row level security;
alter table units enable row level security;
alter table reminders enable row level security;

-- UNITS: scoped via property
create policy "units_select" on units for select
  using (property_id in (select id from properties where organisation_id in (select * from current_user_orgs()) and deleted_at is null)
         and deleted_at is null);
create policy "units_insert" on units for insert
  with check (property_id in (select id from properties where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager'])) and deleted_at is null));
create policy "units_update" on units for update
  using (property_id in (select id from properties where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))))
  with check (property_id in (select id from properties where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))));
create policy "units_delete" on units for delete
  using (property_id in (select id from properties where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))));

-- REMINDERS: org-scoped; no deleted_at column until M6. Written by the
-- reminder engine (service role, bypasses RLS) — users only read them.
create policy "reminders_select" on reminders for select
  using (organisation_id in (select * from current_user_orgs()));

drop policy if exists "shareholders_select" on shareholders;
drop policy if exists "shareholders_insert" on shareholders;
drop policy if exists "shareholders_update" on shareholders;
drop policy if exists "shareholders_delete" on shareholders;

create policy "shareholders_select" on shareholders for select
  using (entity_id in (select id from entities where organisation_id in (select * from current_user_orgs()) and deleted_at is null));
create policy "shareholders_insert" on shareholders for insert
  with check (entity_id in (select id from entities where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))));
create policy "shareholders_update" on shareholders for update
  using (entity_id in (select id from entities where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))))
  with check (entity_id in (select id from entities where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))));
create policy "shareholders_delete" on shareholders for delete
  using (entity_id in (select id from entities where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))));

drop policy if exists "mortgage_events_select" on mortgage_events;
drop policy if exists "mortgage_events_insert" on mortgage_events;
drop policy if exists "mortgage_events_update" on mortgage_events;
drop policy if exists "mortgage_events_delete" on mortgage_events;

create policy "mortgage_events_select" on mortgage_events for select
  using (mortgage_id in (select id from mortgages where organisation_id in (select * from current_user_orgs()) and deleted_at is null));
create policy "mortgage_events_insert" on mortgage_events for insert
  with check (mortgage_id in (select id from mortgages where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))));
create policy "mortgage_events_update" on mortgage_events for update
  using (mortgage_id in (select id from mortgages where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))))
  with check (mortgage_id in (select id from mortgages where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))));
create policy "mortgage_events_delete" on mortgage_events for delete
  using (mortgage_id in (select id from mortgages where organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))));

-- =========================================================================
-- 6. Global reference tables: aasc_areas, lha_rates
--    Anyone authenticated can read; only service_role can write.
-- =========================================================================

alter table aasc_areas enable row level security;
create policy "aasc_areas_select" on aasc_areas for select using (auth.role() = 'authenticated');
-- No insert/update/delete policies — service_role bypasses RLS for admin tooling.

alter table lha_rates enable row level security;
create policy "lha_rates_select" on lha_rates for select using (auth.role() = 'authenticated');

-- =========================================================================
-- 7. Audit_log: append-only via trigger, no direct user writes
-- =========================================================================

alter table audit_log enable row level security;
create policy "audit_log_select" on audit_log for select
  using (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin'])));
-- No insert/update/delete policies — only the security-definer trigger writes.

-- =========================================================================
-- 8. Audit triggers on high-value tables
-- =========================================================================

do $$
declare
  t text;
  audited text[] := array[
    'organisations', 'organisation_members',
    'entities', 'shareholders',
    'properties', 'units', 'tenancies',
    'mortgages', 'mortgage_events', 'valuations',
    'transactions', 'director_loans', 'investor_capital_accounts',
    'compliance_items', 'aasc_contracts', 'aasc_placements'
  ];
begin
  foreach t in array audited loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format(
      'create trigger %1$I_audit after insert or update or delete on %1$I for each row execute function audit_log_trigger()',
      t
    );
  end loop;
end $$;

-- =========================================================================
-- 9. Storage bucket: documents (private, signed URLs only)
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800,  -- 50MB
  array['application/pdf','image/jpeg','image/png','image/heic','image/webp']
)
on conflict (id) do nothing;

create policy "documents_select_own_org" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select id::text from organisations where id in (select * from current_user_orgs())
    )
  );

create policy "documents_insert_own_org" on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select id::text from organisations
      where id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
    )
  );

create policy "documents_delete_own_org" on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select id::text from organisations
      where id in (select * from current_user_orgs_with_role(array['owner','admin']))
    )
  );
