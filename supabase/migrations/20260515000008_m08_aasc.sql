-- TenureIQ M8 — AASC Contracts & Placements.
--
-- Schema additions on aasc_contracts + aasc_placements (the tables
-- exist from the M0 init), a new placement_count_changes append-only
-- ledger, organisation_members.notify_aasc, and a forbidden-name
-- assertion that fails any future migration trying to add a service-
-- user identity column.

set search_path = public;

-- =========================================================================
-- 1. aasc_contracts: new columns from the M8 prompt.
-- =========================================================================

alter table aasc_contracts
  add column if not exists entity_id                       uuid,
  add column if not exists break_clause_date               date,
  add column if not exists contracted_rate_pence_per_week  bigint,
  add column if not exists commission_rate_bps             int not null default 0,
  add column if not exists payment_terms_days              int not null default 30,
  add column if not exists status                          text not null default 'active',
  add column if not exists payable_bank_account_id         uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'aasc_contracts_status_check' and conrelid = 'aasc_contracts'::regclass
  ) then
    alter table aasc_contracts add constraint aasc_contracts_status_check
      check (status in ('active','expired','suspended','terminated'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'aasc_contracts_entity_id_fkey'
  ) then
    alter table aasc_contracts add constraint aasc_contracts_entity_id_fkey
      foreign key (entity_id) references entities(id) on update cascade on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'aasc_contracts_payable_bank_account_fkey'
  ) then
    alter table aasc_contracts add constraint aasc_contracts_payable_bank_account_fkey
      foreign key (payable_bank_account_id) references bank_accounts(id)
      on update cascade on delete set null;
  end if;
end$$;

create index if not exists aasc_contracts_org_status_idx
  on aasc_contracts (organisation_id, status);
create index if not exists aasc_contracts_break_clause_idx
  on aasc_contracts (break_clause_date);
create index if not exists aasc_contracts_end_date_idx
  on aasc_contracts (end_date);

-- =========================================================================
-- 2. aasc_placements: new columns.
-- =========================================================================

alter table aasc_placements
  add column if not exists unit_id                          uuid,
  add column if not exists commission_rate_bps_override     int,
  add column if not exists end_date_expected                date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'aasc_placements_status_check' and conrelid = 'aasc_placements'::regclass
  ) then
    alter table aasc_placements add constraint aasc_placements_status_check
      check (status in ('active','ended','terminated'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'aasc_placements_unit_id_fkey'
  ) then
    alter table aasc_placements add constraint aasc_placements_unit_id_fkey
      foreign key (unit_id) references units(id) on update cascade on delete restrict;
  end if;
end$$;

create index if not exists aasc_placements_org_status_idx
  on aasc_placements (organisation_id, status);
create index if not exists aasc_placements_org_deleted_idx
  on aasc_placements (organisation_id, deleted_at);
create index if not exists aasc_placements_contract_idx
  on aasc_placements (contract_id);
create index if not exists aasc_placements_unit_idx
  on aasc_placements (unit_id);

-- =========================================================================
-- 3. Forbidden-name guard on aasc_placements.
--    Data-protection contract with Clearsprings + Serco forbids
--    identifying info on service users. This DO block raises if any
--    of the well-known PII column names are present today, and the
--    function below is wired into a check trigger so future ALTER
--    TABLE attempts also fail.
-- =========================================================================

do $$
declare
  forbidden text[] := array[
    'name','full_name','first_name','last_name',
    'dob','date_of_birth','nationality',
    'passport','passport_number','national_id',
    'home_office_reference','asylum_reference'
  ];
  col text;
begin
  foreach col in array forbidden loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'aasc_placements'
        and column_name = col
    ) then
      raise exception
        'aasc_placements must not contain column %; the data-protection contract forbids service-user identity data',
        col;
    end if;
  end loop;
end $$;

create or replace function public.assert_no_aasc_pii_columns()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
  forbidden text[] := array[
    'name','full_name','first_name','last_name',
    'dob','date_of_birth','nationality',
    'passport','passport_number','national_id',
    'home_office_reference','asylum_reference'
  ];
  col text;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
  loop
    if obj.command_tag in ('ALTER TABLE','CREATE TABLE')
       and obj.object_identity ilike 'public.aasc_placements%' then
      foreach col in array forbidden loop
        if exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'aasc_placements'
            and column_name = col
        ) then
          raise exception
            'Attempt to add forbidden PII column "%" to aasc_placements rejected', col;
        end if;
      end loop;
    end if;
  end loop;
end;
$$;

drop event trigger if exists assert_no_aasc_pii_columns_trigger;
create event trigger assert_no_aasc_pii_columns_trigger
  on ddl_command_end
  when tag in ('ALTER TABLE','CREATE TABLE')
  execute function assert_no_aasc_pii_columns();

-- =========================================================================
-- 4. placement_count_changes append-only ledger.
-- =========================================================================

create table if not exists placement_count_changes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on update cascade,
  placement_id    uuid not null references aasc_placements(id) on update cascade on delete restrict,
  effective_from  date not null,
  new_count       int not null check (new_count >= 0),
  reason          text,
  created_at      timestamptz(6) not null default current_timestamp
);

create index if not exists placement_count_changes_org_idx
  on placement_count_changes (organisation_id);
create index if not exists placement_count_changes_placement_idx
  on placement_count_changes (placement_id);
create index if not exists placement_count_changes_placement_effective_idx
  on placement_count_changes (placement_id, effective_from);

alter table placement_count_changes enable row level security;

create policy "placement_count_changes_select" on placement_count_changes
  for select using (
    organisation_id in (select * from current_user_orgs())
  );
create policy "placement_count_changes_insert" on placement_count_changes
  for insert with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  );
create policy "placement_count_changes_update" on placement_count_changes
  for update using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  ) with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );
create policy "placement_count_changes_delete" on placement_count_changes
  for delete using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner']))
  );

-- =========================================================================
-- 5. organisation_members.notify_aasc per-user notification flag.
-- =========================================================================

alter table organisation_members
  add column if not exists notify_aasc boolean not null default true;

-- =========================================================================
-- 6. AASC reminder enqueue function — break-clause + end-date at
--    90/60/30 days before. Idempotent via the existing reminders
--    (org, related, days_until_event) unique.
-- =========================================================================

create or replace function public.enqueue_aasc_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted  int := 0;
  v_loop_rows int;
  v_today     date := current_date;
  v_offsets   int[] := array[90, 60, 30];
  v_offset    int;
begin
  foreach v_offset in array v_offsets loop
    if extract(isodow from v_today) in (6, 7) then
      continue;
    end if;

    -- break_clause_date reminders
    insert into reminders (
      organisation_id, related_kind, related_id,
      days_until_event, trigger_at, body_key, context, status, channel
    )
    select
      c.organisation_id,
      'aasc_break' as related_kind,
      c.id,
      v_offset,
      ((c.break_clause_date - v_offset)::timestamp at time zone 'UTC') + interval '8 hours',
      'aasc_break_reminder',
      jsonb_build_object(
        'aasc_contract_id', c.id,
        'contractor', c.contractor,
        'break_clause_date', c.break_clause_date,
        'days_until', v_offset
      ),
      'pending',
      'email'
    from aasc_contracts c
    join organisations o on o.id = c.organisation_id
    where c.deleted_at is null
      and o.deleted_at is null
      and c.status = 'active'
      and c.break_clause_date is not null
      and (c.break_clause_date - v_offset) >= v_today
      and o.created_at <= now() - interval '14 days'
    on conflict (organisation_id, related_kind, related_id, days_until_event)
    do nothing;
    get diagnostics v_loop_rows = row_count;
    v_inserted := v_inserted + v_loop_rows;

    -- end_date reminders
    insert into reminders (
      organisation_id, related_kind, related_id,
      days_until_event, trigger_at, body_key, context, status, channel
    )
    select
      c.organisation_id,
      'aasc_end' as related_kind,
      c.id,
      v_offset,
      ((c.end_date - v_offset)::timestamp at time zone 'UTC') + interval '8 hours',
      'aasc_end_reminder',
      jsonb_build_object(
        'aasc_contract_id', c.id,
        'contractor', c.contractor,
        'end_date', c.end_date,
        'days_until', v_offset
      ),
      'pending',
      'email'
    from aasc_contracts c
    join organisations o on o.id = c.organisation_id
    where c.deleted_at is null
      and o.deleted_at is null
      and c.status = 'active'
      and c.end_date is not null
      and (c.end_date - v_offset) >= v_today
      and o.created_at <= now() - interval '14 days'
    on conflict (organisation_id, related_kind, related_id, days_until_event)
    do nothing;
    get diagnostics v_loop_rows = row_count;
    v_inserted := v_inserted + v_loop_rows;
  end loop;

  return v_inserted;
end;
$$;

revoke execute on function public.enqueue_aasc_reminders() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.enqueue_aasc_reminders() to service_role';
  end if;
end$$;

-- AASC supersede trigger — when a contract's break/end date changes or
-- it's terminated, mark its pending reminders superseded.
create or replace function public.supersede_aasc_reminders()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    update reminders set status = 'superseded', updated_at = current_timestamp
      where related_kind in ('aasc_break','aasc_end')
        and related_id = OLD.id
        and status in ('pending','claimed');
    return OLD;
  elsif TG_OP = 'UPDATE' then
    if (OLD.break_clause_date is distinct from NEW.break_clause_date)
       or (OLD.end_date is distinct from NEW.end_date)
       or (OLD.deleted_at is null and NEW.deleted_at is not null)
       or (OLD.status is distinct from NEW.status and NEW.status in ('terminated','suspended','expired'))
    then
      update reminders set status = 'superseded', updated_at = current_timestamp
        where related_kind in ('aasc_break','aasc_end')
          and related_id = NEW.id
          and status in ('pending','claimed');
    end if;
    return NEW;
  end if;
  return NEW;
end;
$$;

drop trigger if exists aasc_contract_supersede_update on aasc_contracts;
create trigger aasc_contract_supersede_update
  after update of break_clause_date, end_date, deleted_at, status on aasc_contracts
  for each row execute function supersede_aasc_reminders();

drop trigger if exists aasc_contract_supersede_delete on aasc_contracts;
create trigger aasc_contract_supersede_delete
  after delete on aasc_contracts
  for each row execute function supersede_aasc_reminders();
