-- TenureIQ — Security fixes from migration-reviewer + security-reviewer
--
-- Addresses findings in commit 990c7c4:
--   P0  audit trigger silently NULLs organisation_id for shareholders &
--       mortgage_events (they don't have the column). Audit rows become
--       unreadable to non-service-role users.
--   P0  aasc_placements audit captures full row via to_jsonb(NEW); future
--       columns (e.g. anything name-like) would be silently logged into
--       audit_log, breaking the AASC "no service user names" rule.
--   P0  storage policies on `documents` bucket lack UPDATE — re-uploads
--       and metadata edits are silently denied.
--   P0  users table has only a SELECT policy; signup mirror-row creation
--       must currently go through service role.
--   P1  archived rows are unreachable by non-service-role users because
--       the four-policy template filters `deleted_at is null`, but the
--       detail pages render archived state with a Restore button.

set search_path = public;

-- =========================================================================
-- 1. Specialised audit triggers for tables without organisation_id.
-- =========================================================================

create or replace function public.audit_log_trigger_shareholders()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_entity uuid := coalesce(NEW.entity_id, OLD.entity_id);
begin
  select e.organisation_id into v_org from entities e where e.id = v_entity;

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

create or replace function public.audit_log_trigger_mortgage_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_mortgage uuid := coalesce(NEW.mortgage_id, OLD.mortgage_id);
begin
  select m.organisation_id into v_org from mortgages m where m.id = v_mortgage;

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

drop trigger if exists shareholders_audit on shareholders;
create trigger shareholders_audit
  after insert or update or delete on shareholders
  for each row execute function audit_log_trigger_shareholders();

drop trigger if exists mortgage_events_audit on mortgage_events;
create trigger mortgage_events_audit
  after insert or update or delete on mortgage_events
  for each row execute function audit_log_trigger_mortgage_events();

-- =========================================================================
-- 2. aasc_placements: column-allowlist audit trigger.
--    Re-applies the generic shape but enumerates exactly which columns get
--    serialised. Adding a new column to the table will NOT automatically
--    propagate to audit_log — a follow-up migration must explicitly add it
--    here, which is the desired hard gate against accidental PII logging.
-- =========================================================================

create or replace function public.audit_log_trigger_aasc_placements()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := coalesce(NEW.organisation_id, OLD.organisation_id);
  v_before jsonb;
  v_after jsonb;
begin
  if TG_OP <> 'INSERT' then
    v_before := jsonb_build_object(
      'id', OLD.id,
      'organisation_id', OLD.organisation_id,
      'contract_id', OLD.contract_id,
      'tenancy_id', OLD.tenancy_id,
      'property_id', OLD.property_id,
      'placement_ref', OLD.placement_ref,
      'weekly_rate_pence', OLD.weekly_rate_pence,
      'service_user_count', OLD.service_user_count,
      'start_date', OLD.start_date,
      'end_date', OLD.end_date,
      'status', OLD.status,
      'deleted_at', OLD.deleted_at
    );
  end if;

  if TG_OP <> 'DELETE' then
    v_after := jsonb_build_object(
      'id', NEW.id,
      'organisation_id', NEW.organisation_id,
      'contract_id', NEW.contract_id,
      'tenancy_id', NEW.tenancy_id,
      'property_id', NEW.property_id,
      'placement_ref', NEW.placement_ref,
      'weekly_rate_pence', NEW.weekly_rate_pence,
      'service_user_count', NEW.service_user_count,
      'start_date', NEW.start_date,
      'end_date', NEW.end_date,
      'status', NEW.status,
      'deleted_at', NEW.deleted_at
    );
  end if;

  insert into audit_log (actor_user_id, organisation_id, action, table_name, row_id, before, after)
  values (
    auth.uid(),
    v_org,
    TG_OP,
    TG_TABLE_NAME,
    coalesce((NEW.id)::uuid, (OLD.id)::uuid),
    v_before,
    v_after
  );

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists aasc_placements_audit on aasc_placements;
create trigger aasc_placements_audit
  after insert or update or delete on aasc_placements
  for each row execute function audit_log_trigger_aasc_placements();

-- =========================================================================
-- 3. Storage: UPDATE policy on documents bucket.
-- =========================================================================

drop policy if exists "documents_update_own_org" on storage.objects;
create policy "documents_update_own_org" on storage.objects
  for update
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select id::text from organisations
      where id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
    )
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select id::text from organisations
      where id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
    )
  );

-- =========================================================================
-- 4. users: self-managed insert/update for the auth.users mirror row.
-- =========================================================================

drop policy if exists "users_self_insert" on users;
create policy "users_self_insert" on users
  for insert with check (id = auth.uid());

drop policy if exists "users_self_update" on users;
create policy "users_self_update" on users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- =========================================================================
-- 5. Archived rows: owner/admin can SELECT soft-deleted rows on tenant
--    tables so the detail pages with the Restore button actually load
--    archived rows for these users. Members still only see live rows.
--
--    PostgreSQL combines RLS policies with OR for SELECT. The existing
--    `<table>_select` policy keeps `deleted_at is null` for members; this
--    additional policy adds the archived-visible-to-owner-admin path.
-- =========================================================================

do $$
declare
  t text;
  tables text[] := array[
    'entities', 'bank_accounts',
    'properties', 'units', 'tenants', 'tenancies',
    'mortgages', 'valuations', 'transactions',
    'director_loans', 'investor_capital_accounts',
    'compliance_items', 'maintenance_jobs', 'tasks',
    'documents', 'aasc_contracts', 'aasc_placements'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%1$s_select_archived" on %1$I', t);
    execute format($f$
      create policy "%1$s_select_archived" on %1$I for select
      using (
        deleted_at is not null
        and organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
      )
    $f$, t);
  end loop;
end $$;
