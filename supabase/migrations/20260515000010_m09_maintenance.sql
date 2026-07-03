-- TenureIQ M9 — Maintenance & contractors.
--
-- Schema additions:
--   - contractors table (was just a text field on maintenance_jobs).
--   - maintenance_jobs gets the missing columns (kind, reported_at,
--     reported_by_*, tenancy_id, target_completion_date, completed_at,
--     assigned_contractor_id, cost_pence).
--   - maintenance_job_events append-only timeline.
--   - maintenance_quotes (multiple per job allowed; first-accepted wins).
--   - maintenance_invoices (1+ per job; links to M5 transactions when paid).
-- All four tables: RLS four-policy template + audit triggers (contractors
-- and maintenance_jobs are on the high-value list; invoices are
-- financially material).
--
-- + organisation_members.notify_contractor_insurance flag.
-- + enqueue_contractor_insurance_reminders() function (60/30/14/7
--   day offsets) reusing the reminders table.

set search_path = public;

-- =========================================================================
-- 1. contractors table.
-- =========================================================================

create table if not exists contractors (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on update cascade,
  entity_id       uuid references entities(id) on update cascade on delete restrict,
  name            text not null,
  kind            text not null,
  contact_name    text,
  phone           text,
  email           text,
  insurance_expiry date,
  accreditations  text[] not null default array[]::text[],
  notes           text,

  created_at      timestamptz(6) not null default current_timestamp,
  updated_at      timestamptz(6) not null default current_timestamp,
  deleted_at      timestamptz(6)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contractors_kind_check') then
    alter table contractors add constraint contractors_kind_check
      check (kind in (
        'plumber','electrician','gas_safe','locksmith','cleaner',
        'gardener','handyman','roofer','damp_specialist','pest_control',
        'fire_safety','epc_assessor','general','other'
      ));
  end if;
end$$;

create index if not exists contractors_org_idx on contractors (organisation_id);
create index if not exists contractors_org_deleted_idx on contractors (organisation_id, deleted_at);
create index if not exists contractors_insurance_expiry_idx on contractors (insurance_expiry);

alter table contractors enable row level security;

create policy "contractors_select" on contractors for select
  using (
    organisation_id in (select * from current_user_orgs())
    and (deleted_at is null or current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role')
  );
create policy "contractors_select_archived" on contractors for select
  using (
    deleted_at is not null
    and organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );
create policy "contractors_insert" on contractors for insert
  with check (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager'])));
create policy "contractors_update" on contractors for update
  using (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager'])))
  with check (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager'])));
create policy "contractors_delete" on contractors for delete
  using (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin'])));

drop trigger if exists contractors_audit on contractors;
create trigger contractors_audit
  after insert or update or delete on contractors
  for each row execute function audit_log_trigger();

-- =========================================================================
-- 2. maintenance_jobs: extend.
-- =========================================================================

alter table maintenance_jobs
  add column if not exists tenancy_id              uuid,
  add column if not exists reported_by_user_id     uuid,
  add column if not exists reported_by_tenant_id   uuid,
  add column if not exists kind                    text not null default 'repair',
  add column if not exists reported_at             timestamptz(6) not null default current_timestamp,
  add column if not exists target_completion_date  date,
  add column if not exists completed_at            timestamptz(6),
  add column if not exists assigned_contractor_id  uuid,
  add column if not exists cost_pence              bigint;

-- Re-enumerate status to the M9 list. Migrate legacy values.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'maintenance_jobs_status_check') then
    alter table maintenance_jobs drop constraint maintenance_jobs_status_check;
  end if;
end$$;

update maintenance_jobs
  set status = case status
    when 'awaiting_quote' then 'awaiting_quote'
    when 'in_progress'    then 'in_progress'
    when 'completed'      then 'completed'
    when 'cancelled'      then 'cancelled'
    when 'reported'       then 'reported'
    when 'triaged'        then 'triaged'
    else 'reported'
  end;

alter table maintenance_jobs add constraint maintenance_jobs_status_check
  check (status in (
    'reported','triaged','awaiting_quote','quote_received','approved',
    'scheduled','in_progress','awaiting_invoice','completed','cancelled'
  ));

alter table maintenance_jobs add constraint maintenance_jobs_priority_check
  check (priority in ('emergency','urgent','normal','low'));

alter table maintenance_jobs add constraint maintenance_jobs_kind_check
  check (kind in ('repair','planned_maintenance','inspection','cleaning','statutory','emergency'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'maintenance_jobs_assigned_contractor_fkey') then
    alter table maintenance_jobs add constraint maintenance_jobs_assigned_contractor_fkey
      foreign key (assigned_contractor_id) references contractors(id) on update cascade on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'maintenance_jobs_tenancy_fkey') then
    alter table maintenance_jobs add constraint maintenance_jobs_tenancy_fkey
      foreign key (tenancy_id) references tenancies(id) on update cascade on delete restrict;
  end if;
end$$;

create index if not exists maintenance_jobs_org_deleted_idx on maintenance_jobs (organisation_id, deleted_at);
create index if not exists maintenance_jobs_org_status_idx on maintenance_jobs (organisation_id, status);
create index if not exists maintenance_jobs_org_priority_idx on maintenance_jobs (organisation_id, priority);
create index if not exists maintenance_jobs_assigned_contractor_idx on maintenance_jobs (assigned_contractor_id);

-- =========================================================================
-- 3. maintenance_job_events — append-only timeline.
-- =========================================================================

create table if not exists maintenance_job_events (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on update cascade,
  job_id          uuid not null references maintenance_jobs(id) on update cascade on delete restrict,
  actor_user_id   uuid,
  kind            text not null check (kind in (
    'status_change','note_added','quote_received','invoice_received',
    'contractor_assigned','tenant_message'
  )),
  body            text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz(6) not null default current_timestamp
);

create index if not exists maintenance_job_events_org_idx on maintenance_job_events (organisation_id);
create index if not exists maintenance_job_events_job_idx on maintenance_job_events (job_id);
create index if not exists maintenance_job_events_job_created_idx on maintenance_job_events (job_id, created_at);

alter table maintenance_job_events enable row level security;

create policy "maintenance_job_events_select" on maintenance_job_events for select
  using (organisation_id in (select * from current_user_orgs()));
create policy "maintenance_job_events_insert" on maintenance_job_events for insert
  with check (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant'])));
-- Append-only ledger: no update / delete policies on purpose.

-- =========================================================================
-- 4. maintenance_quotes.
-- =========================================================================

create table if not exists maintenance_quotes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on update cascade,
  job_id          uuid not null references maintenance_jobs(id) on update cascade on delete restrict,
  contractor_id   uuid not null references contractors(id) on update cascade on delete restrict,
  amount_pence    bigint not null check (amount_pence >= 0),
  validity_until  date,
  received_at     timestamptz(6) not null default current_timestamp,
  status          text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  notes           text,
  source_document_id uuid,

  created_at      timestamptz(6) not null default current_timestamp,
  updated_at      timestamptz(6) not null default current_timestamp,
  deleted_at      timestamptz(6)
);

create index if not exists maintenance_quotes_org_idx on maintenance_quotes (organisation_id);
create index if not exists maintenance_quotes_job_idx on maintenance_quotes (job_id);
create index if not exists maintenance_quotes_contractor_idx on maintenance_quotes (contractor_id);

alter table maintenance_quotes enable row level security;

create policy "maintenance_quotes_select" on maintenance_quotes for select
  using (
    organisation_id in (select * from current_user_orgs())
    and (deleted_at is null or current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role')
  );
create policy "maintenance_quotes_insert" on maintenance_quotes for insert
  with check (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager'])));
create policy "maintenance_quotes_update" on maintenance_quotes for update
  using (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager'])))
  with check (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager'])));
create policy "maintenance_quotes_delete" on maintenance_quotes for delete
  using (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin'])));

-- =========================================================================
-- 5. maintenance_invoices.
-- =========================================================================

create table if not exists maintenance_invoices (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on update cascade,
  job_id          uuid not null references maintenance_jobs(id) on update cascade on delete restrict,
  contractor_id   uuid not null references contractors(id) on update cascade on delete restrict,
  amount_pence    bigint not null check (amount_pence >= 0),
  vat_pence       bigint not null default 0 check (vat_pence >= 0),
  invoice_number  text not null,
  invoice_date    date not null,
  paid_at         timestamptz(6),
  transaction_id  uuid,
  source_document_id uuid,

  created_at      timestamptz(6) not null default current_timestamp,
  updated_at      timestamptz(6) not null default current_timestamp,
  deleted_at      timestamptz(6),

  constraint maintenance_invoices_unique
    unique (organisation_id, contractor_id, invoice_number)
);

create index if not exists maintenance_invoices_org_idx on maintenance_invoices (organisation_id);
create index if not exists maintenance_invoices_org_deleted_idx on maintenance_invoices (organisation_id, deleted_at);
create index if not exists maintenance_invoices_job_idx on maintenance_invoices (job_id);
create index if not exists maintenance_invoices_contractor_idx on maintenance_invoices (contractor_id);
create index if not exists maintenance_invoices_transaction_idx on maintenance_invoices (transaction_id);

alter table maintenance_invoices enable row level security;

create policy "maintenance_invoices_select" on maintenance_invoices for select
  using (
    organisation_id in (select * from current_user_orgs())
    and (deleted_at is null or current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role')
  );
create policy "maintenance_invoices_insert" on maintenance_invoices for insert
  with check (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant'])));
create policy "maintenance_invoices_update" on maintenance_invoices for update
  using (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant'])))
  with check (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant'])));
create policy "maintenance_invoices_delete" on maintenance_invoices for delete
  using (organisation_id in (select * from current_user_orgs_with_role(array['owner','admin'])));

-- Audit triggers — both are high-value.
drop trigger if exists maintenance_invoices_audit on maintenance_invoices;
create trigger maintenance_invoices_audit
  after insert or update or delete on maintenance_invoices
  for each row execute function audit_log_trigger();

drop trigger if exists maintenance_quotes_audit on maintenance_quotes;
create trigger maintenance_quotes_audit
  after insert or update or delete on maintenance_quotes
  for each row execute function audit_log_trigger();

-- =========================================================================
-- 6. notify_contractor_insurance preference + enqueue.
-- =========================================================================

alter table organisation_members
  add column if not exists notify_contractor_insurance boolean not null default true;

create or replace function public.enqueue_contractor_insurance_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted  int := 0;
  v_loop_rows int;
  v_today     date := current_date;
  v_offsets   int[] := array[60, 30, 14, 7, 0, -7];
  v_offset    int;
begin
  foreach v_offset in array v_offsets loop
    if v_offset > 0 and extract(isodow from v_today) in (6, 7) then
      continue;
    end if;

    insert into reminders (
      organisation_id, related_kind, related_id,
      days_until_event, trigger_at, body_key, context, status, channel
    )
    select
      c.organisation_id,
      'contractor_insurance' as related_kind,
      c.id as related_id,
      v_offset,
      ((c.insurance_expiry - v_offset)::timestamp at time zone 'UTC') + interval '8 hours',
      'contractor_insurance_reminder',
      jsonb_build_object(
        'contractor_id', c.id,
        'contractor_name', c.name,
        'insurance_expiry', c.insurance_expiry,
        'days_until', v_offset
      ),
      'pending',
      'email'
    from contractors c
    join organisations o on o.id = c.organisation_id
    where c.deleted_at is null
      and o.deleted_at is null
      and c.insurance_expiry is not null
      and (c.insurance_expiry - v_offset) >= v_today
      and o.created_at <= now() - interval '14 days'
    on conflict (organisation_id, related_kind, related_id, days_until_event)
    do nothing;

    get diagnostics v_loop_rows = row_count;
    v_inserted := v_inserted + v_loop_rows;
  end loop;

  return v_inserted;
end;
$$;

revoke execute on function public.enqueue_contractor_insurance_reminders() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.enqueue_contractor_insurance_reminders() to service_role';
  end if;
end$$;

-- Supersede contractor reminders on insurance-date change / deletion.
create or replace function public.supersede_contractor_reminders()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    update reminders set status = 'superseded', updated_at = current_timestamp
      where related_kind = 'contractor_insurance'
        and related_id = OLD.id
        and status in ('pending','claimed');
    return OLD;
  elsif TG_OP = 'UPDATE' then
    if (OLD.insurance_expiry is distinct from NEW.insurance_expiry)
       or (OLD.deleted_at is null and NEW.deleted_at is not null)
    then
      update reminders set status = 'superseded', updated_at = current_timestamp
        where related_kind = 'contractor_insurance'
          and related_id = NEW.id
          and status in ('pending','claimed');
    end if;
    return NEW;
  end if;
  return NEW;
end;
$$;

drop trigger if exists contractors_supersede_update on contractors;
create trigger contractors_supersede_update
  after update of insurance_expiry, deleted_at on contractors
  for each row execute function supersede_contractor_reminders();

drop trigger if exists contractors_supersede_delete on contractors;
create trigger contractors_supersede_delete
  after delete on contractors
  for each row execute function supersede_contractor_reminders();
