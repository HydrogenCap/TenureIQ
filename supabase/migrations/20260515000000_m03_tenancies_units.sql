-- TenureIQ M3 — Tenancies & Units schema additions.
--
-- Changes:
--   - `tenancies` gets end_date_intended, notice_given_at, vacate_date, plus
--     an (organisation_id, status) index for the global /tenancies list.
--   - rent_period CHECK widened to accept 'annual'.
--   - New table `tenancy_tenants` — join for joint AST tenants.
--   - New table `rent_changes` — rent history; one row per tenancy at minimum.
--   - RLS + audit triggers on both new tables.

set search_path = public;

-- =========================================================================
-- 1. tenancies: new optional date columns + extended rent_period values.
-- =========================================================================

alter table tenancies
  add column if not exists end_date_intended date,
  add column if not exists notice_given_at  date,
  add column if not exists vacate_date      date;

-- Drop and recreate the rent_period check so `annual` is accepted.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'tenancies_rent_period_check'
      and conrelid = 'tenancies'::regclass
  ) then
    alter table tenancies drop constraint tenancies_rent_period_check;
  end if;
end$$;

alter table tenancies
  add constraint tenancies_rent_period_check
  check (rent_period in ('weekly','four_weekly','monthly','annual'));

create index if not exists tenancies_organisation_id_status_idx
  on tenancies (organisation_id, status);

-- =========================================================================
-- 2. tenancy_tenants — join table for joint AST tenants.
-- =========================================================================

create table if not exists tenancy_tenants (
  id          uuid primary key default gen_random_uuid(),
  tenancy_id  uuid not null references tenancies(id) on delete cascade on update cascade,
  tenant_id   uuid not null references tenants(id) on update cascade,
  created_at  timestamptz(6) not null default current_timestamp,

  constraint tenancy_tenants_unique unique (tenancy_id, tenant_id)
);

create index if not exists tenancy_tenants_tenancy_id_idx on tenancy_tenants (tenancy_id);
create index if not exists tenancy_tenants_tenant_id_idx  on tenancy_tenants (tenant_id);

-- RLS: a member can see/manage joins for tenancies in their own org.
-- The tenancy itself carries organisation_id so we resolve org via the FK.
alter table tenancy_tenants enable row level security;

create policy "tenancy_tenants_select" on tenancy_tenants
  for select using (
    tenancy_id in (
      select id from tenancies
      where organisation_id in (select * from current_user_orgs())
        and deleted_at is null
    )
  );

create policy "tenancy_tenants_insert" on tenancy_tenants
  for insert with check (
    tenancy_id in (
      select id from tenancies
      where organisation_id in (
        select * from current_user_orgs_with_role(array['owner','admin','manager'])
      )
    )
  );

create policy "tenancy_tenants_update" on tenancy_tenants
  for update using (
    tenancy_id in (
      select id from tenancies
      where organisation_id in (
        select * from current_user_orgs_with_role(array['owner','admin','manager'])
      )
    )
  ) with check (
    tenancy_id in (
      select id from tenancies
      where organisation_id in (
        select * from current_user_orgs_with_role(array['owner','admin','manager'])
      )
    )
  );

create policy "tenancy_tenants_delete" on tenancy_tenants
  for delete using (
    tenancy_id in (
      select id from tenancies
      where organisation_id in (
        select * from current_user_orgs_with_role(array['owner','admin'])
      )
    )
  );

-- =========================================================================
-- 3. rent_changes — rent history per tenancy.
-- =========================================================================

create table if not exists rent_changes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on update cascade,
  tenancy_id      uuid not null references tenancies(id) on delete cascade on update cascade,

  effective_from  date not null,
  new_rent_pence  bigint not null check (new_rent_pence >= 0),
  new_rent_period text not null check (new_rent_period in ('weekly','four_weekly','monthly','annual')),
  reason          text not null check (reason in ('initial','review','regeared','arrears_negotiation','adjustment')),
  notes           text,

  created_at      timestamptz(6) not null default current_timestamp
);

create index if not exists rent_changes_organisation_id_idx on rent_changes (organisation_id);
create index if not exists rent_changes_tenancy_id_idx      on rent_changes (tenancy_id);
create index if not exists rent_changes_tenancy_effective_idx on rent_changes (tenancy_id, effective_from);

alter table rent_changes enable row level security;

create policy "rent_changes_select" on rent_changes
  for select using (
    organisation_id in (select * from current_user_orgs())
  );

create policy "rent_changes_insert" on rent_changes
  for insert with check (
    organisation_id in (
      select * from current_user_orgs_with_role(array['owner','admin','manager'])
    )
  );

create policy "rent_changes_update" on rent_changes
  for update using (
    organisation_id in (
      select * from current_user_orgs_with_role(array['owner','admin','manager'])
    )
  ) with check (
    organisation_id in (
      select * from current_user_orgs_with_role(array['owner','admin','manager'])
    )
  );

create policy "rent_changes_delete" on rent_changes
  for delete using (
    organisation_id in (
      select * from current_user_orgs_with_role(array['owner','admin'])
    )
  );

-- Audit: rent_changes is high-value (rent history is finance data).
-- tenancy_tenants is administrative — audit it too to surface assignment shifts.

drop trigger if exists rent_changes_audit on rent_changes;
create trigger rent_changes_audit
  after insert or update or delete on rent_changes
  for each row execute function audit_log_trigger();

-- tenancy_tenants has no organisation_id — resolve via parent tenancy.

create or replace function public.audit_log_trigger_tenancy_tenants()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select t.organisation_id into v_org
  from tenancies t where t.id = coalesce(NEW.tenancy_id, OLD.tenancy_id);

  insert into audit_log (actor_user_id, organisation_id, action, table_name, row_id, before, after)
  values (
    auth.uid(),
    v_org,
    TG_OP,
    TG_TABLE_NAME,
    coalesce((NEW.id)::uuid, (OLD.id)::uuid),
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end
  );

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists tenancy_tenants_audit on tenancy_tenants;
create trigger tenancy_tenants_audit
  after insert or update or delete on tenancy_tenants
  for each row execute function audit_log_trigger_tenancy_tenants();
