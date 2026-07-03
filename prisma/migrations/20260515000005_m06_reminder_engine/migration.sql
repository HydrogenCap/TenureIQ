-- TenureIQ M6 — Compliance reminder engine.
--
-- Adds:
--   - organisation_members per-user notification preferences.
--   - reminders extra columns + idempotency unique + claim columns.
--   - cron_run_log observability table (RLS-disabled, owner-only via app).
--   - enqueue_compliance_reminders() PL/pgSQL function.
--   - claim_pending_reminders(limit) PL/pgSQL function.
--   - AFTER UPDATE supersede trigger on compliance_items.

set search_path = public;

-- =========================================================================
-- 1. organisation_members: per-user notification preferences.
-- =========================================================================

alter table organisation_members
  add column if not exists notify_compliance boolean not null default true,
  add column if not exists notify_mortgages  boolean not null default true,
  add column if not exists notify_tenancies  boolean not null default true;

-- =========================================================================
-- 2. reminders: idempotency + claim + retry shape.
-- =========================================================================

alter table reminders
  add column if not exists days_until_event int,
  add column if not exists body_key         text,
  add column if not exists context          jsonb not null default '{}'::jsonb,
  add column if not exists status           text not null default 'pending',
  add column if not exists claimed_at       timestamptz(6),
  add column if not exists claimed_by       text,
  add column if not exists failed_at        timestamptz(6),
  add column if not exists failure_reason   text,
  add column if not exists retry_count      int not null default 0,
  add column if not exists updated_at       timestamptz(6) not null default current_timestamp,
  add column if not exists deleted_at       timestamptz(6);

-- The original schema had subject + body NOT NULL with no defaults.
-- They're now optional; the cron renders from body_key + context at
-- send time so late-arriving data (e.g. issuer name updates) propagates.
alter table reminders alter column subject drop not null;
alter table reminders alter column body drop not null;

-- Backfill days_until_event for any pre-existing rows seeded before the
-- engine landed (probably none in prod, but harmless if so).
update reminders set days_until_event = 0 where days_until_event is null;
alter table reminders alter column days_until_event set not null;
alter table reminders alter column body_key set default 'compliance_reminder';
update reminders set body_key = 'compliance_reminder' where body_key is null;
alter table reminders alter column body_key set not null;

-- CHECK on status values
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reminders_status_check' and conrelid = 'reminders'::regclass
  ) then
    alter table reminders add constraint reminders_status_check
      check (status in ('pending', 'claimed', 'sent', 'failed', 'superseded'));
  end if;
end$$;

-- Idempotency: one reminder per (org, related, offset).
create unique index if not exists reminders_org_related_offset_unique
  on reminders (organisation_id, related_kind, related_id, days_until_event);

-- Claim/send hot path
create index if not exists reminders_status_trigger_idx
  on reminders (status, trigger_at)
  where deleted_at is null;

-- =========================================================================
-- 3. cron_run_log table. Not multi-tenant — single org-wide log
--    surfaced only on the owner-only /admin/cron-log page. No RLS;
--    reads via the service role from the admin page (server-only).
-- =========================================================================

create table if not exists cron_run_log (
  id              bigserial primary key,
  job             text not null,
  started_at      timestamptz(6) not null default current_timestamp,
  finished_at     timestamptz(6),
  status          text not null default 'running' check (status in ('running','ok','failed')),
  processed       int not null default 0,
  failed          int not null default 0,
  notes           text,
  error_message   text
);

create index if not exists cron_run_log_job_started_idx
  on cron_run_log (job, started_at desc);
create index if not exists cron_run_log_status_idx
  on cron_run_log (status);

-- RLS denied to all — only the service role (cron handler + admin page
-- via lib/db/admin.ts) can read or write.
alter table cron_run_log enable row level security;

-- =========================================================================
-- 4. enqueue_compliance_reminders() — runs daily 07:00 UTC.
--    Idempotent: re-running on the same calendar day produces no rows
--    thanks to the (organisation_id, related_kind, related_id,
--    days_until_event) unique constraint.
--
--    Reminder offsets: 90, 60, 30, 14, 7, 0, -7 days before/after
--    expiry. Weekend suppression for positive offsets (matches the
--    cron-and-reminders skill ref). Overdue (-7) always sends.
--
--    14-day onboarding grace: organisations younger than 14 days are
--    skipped. Don't blast a brand-new org with their existing fleet.
-- =========================================================================

create or replace function public.enqueue_compliance_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_batch int := 0;
  v_today date := current_date;
  v_offsets int[] := array[90, 60, 30, 14, 7, 0, -7];
  v_offset int;
begin
  foreach v_offset in array v_offsets loop
    -- Weekend suppression: skip Sat/Sun runs for positive offsets.
    -- Overdue (-7) and zero-day always send.
    if v_offset > 0 and extract(isodow from v_today) in (6, 7) then
      continue;
    end if;

    insert into reminders (
      organisation_id, related_kind, related_id,
      days_until_event, trigger_at, body_key, context,
      status, channel
    )
    select
      ci.organisation_id,
      'compliance' as related_kind,
      ci.id as related_id,
      v_offset as days_until_event,
      -- Trigger at 08:00 UTC on the offset day so the send loop picks
      -- it up cleanly.
      (ci.expiry_date - v_offset)::timestamptz + interval '8 hours' as trigger_at,
      'compliance_reminder' as body_key,
      jsonb_build_object(
        'compliance_item_id', ci.id,
        'kind', ci.kind,
        'expiry_date', ci.expiry_date,
        'days_until', v_offset,
        'property_id', ci.property_id,
        'issuer', ci.issuer
      ) as context,
      'pending' as status,
      'email' as channel
    from compliance_items ci
    join organisations o on o.id = ci.organisation_id
    where ci.deleted_at is null
      and o.deleted_at is null
      and ci.status <> 'exempt'
      and ci.expiry_date is not null
      -- 14-day onboarding grace
      and o.created_at <= now() - interval '14 days'
      -- Only enqueue if the trigger is still in the future-or-today.
      -- (Avoid backfilling old expiry events.)
      and (ci.expiry_date - v_offset) >= v_today
    on conflict (organisation_id, related_kind, related_id, days_until_event)
    do nothing;

    get diagnostics v_batch = row_count;
    v_inserted := v_inserted + v_batch;
  end loop;

  return v_inserted;
end;
$$;

-- =========================================================================
-- 5. claim_pending_reminders(limit) — atomic claim for the send loop.
--    FOR UPDATE SKIP LOCKED prevents the same reminder being claimed
--    by two concurrent invocations of the send route.
-- =========================================================================

create or replace function public.claim_pending_reminders(
  p_limit int,
  p_claimed_by text
)
returns setof reminders
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update reminders r
    set status = 'claimed',
        claimed_at = current_timestamp,
        claimed_by = p_claimed_by,
        updated_at = current_timestamp
    where r.id in (
      select id from reminders
      where status = 'pending'
        and trigger_at <= current_timestamp
        and deleted_at is null
        and retry_count < 3
      order by trigger_at
      limit p_limit
      for update skip locked
    )
    returning r.*;
end;
$$;

-- =========================================================================
-- 6. AFTER UPDATE supersede trigger.
--    When a compliance item's expiry_date changes (or it's archived),
--    mark its pending reminders as superseded so the next enqueue can
--    re-issue them at the new offsets.
-- =========================================================================

create or replace function public.supersede_compliance_reminders()
returns trigger
language plpgsql
as $$
begin
  if (TG_OP = 'UPDATE') then
    if (OLD.expiry_date is distinct from NEW.expiry_date)
       or (OLD.deleted_at is null and NEW.deleted_at is not null)
       or (OLD.status is distinct from NEW.status and NEW.status = 'exempt')
    then
      update reminders
        set status = 'superseded',
            updated_at = current_timestamp
        where related_kind = 'compliance'
          and related_id = NEW.id
          and status in ('pending', 'claimed');
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists compliance_supersede on compliance_items;
create trigger compliance_supersede
  after update on compliance_items
  for each row execute function supersede_compliance_reminders();
