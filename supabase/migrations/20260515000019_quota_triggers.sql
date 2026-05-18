-- Plan-quota enforcement at the DB layer.
--
-- Why this migration: the lib/billing/can.ts helpers do a count-then-
-- check before the action's insert. Two concurrent inserts can therefore
-- both see "9 of 10 used" and both succeed, producing 11. RLS doesn't
-- gate counts and the action layer holds no row lock between read and
-- write.
--
-- Fix: BEFORE INSERT triggers on the three quotaed tables that
--   1. take a transaction-scoped advisory lock on (resource, org)
--   2. count current rows under the lock
--   3. raise sqlstate P0001 with prefix 'quota_exceeded' if over limit
-- The advisory lock + counting + insert all happen in the calling
-- INSERT's own transaction, so the check is atomic.
--
-- Plan limit values are mirrored from lib/billing/plans.ts. The two
-- sources MUST stay in sync — any drift is a tunable upgrade-path bug,
-- not a security issue (the DB is authoritative).
--
-- The TS-side gate stays — it gives the user a clean upgrade prompt
-- BEFORE the action fires. The trigger is the safety net for the rare
-- concurrent-insert race.

set search_path = public;

-- =========================================================================
-- 1. Plan-limit lookup functions — single source of truth in SQL.
-- =========================================================================
create or replace function plan_max_properties(p_plan text)
returns int
language sql
immutable
parallel safe
as $$
  select case p_plan
    when 'free' then 3
    when 'starter' then 10
    when 'growth' then 50
    when 'pro' then 250
    -- enterprise + unknown plan → null (unlimited)
    else null
  end;
$$;

create or replace function plan_max_documents(p_plan text)
returns int
language sql
immutable
parallel safe
as $$
  select case p_plan
    when 'free' then 10
    when 'starter' then 100
    when 'growth' then 1000
    when 'pro' then 10000
    else null
  end;
$$;

create or replace function plan_max_ocr_per_month(p_plan text)
returns int
language sql
immutable
parallel safe
as $$
  select case p_plan
    when 'free' then 5
    when 'starter' then 50
    when 'growth' then 250
    when 'pro' then 2000
    else null
  end;
$$;

-- =========================================================================
-- 2. Property quota trigger
-- =========================================================================
create or replace function enforce_property_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max int;
  v_used int;
begin
  select plan into v_plan
    from organisations
    where id = NEW.organisation_id;
  v_max := plan_max_properties(v_plan);
  if v_max is null then return NEW; end if;

  -- Serialise concurrent inserts for this org. Two keys so the same
  -- function space can serve other resources without false sharing.
  perform pg_advisory_xact_lock(
    hashtext('property_quota'),
    hashtext(NEW.organisation_id::text)
  );

  select count(*) into v_used
    from properties
    where organisation_id = NEW.organisation_id
      and deleted_at is null;

  if v_used >= v_max then
    raise exception 'quota_exceeded: % plan caps properties at %', v_plan, v_max
      using errcode = 'P0001';
  end if;

  return NEW;
end
$$;

drop trigger if exists property_quota_check on properties;
create trigger property_quota_check
  before insert on properties
  for each row execute function enforce_property_quota();

-- =========================================================================
-- 3. Document quota trigger
-- =========================================================================
create or replace function enforce_document_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max int;
  v_used int;
begin
  select plan into v_plan
    from organisations
    where id = NEW.organisation_id;
  v_max := plan_max_documents(v_plan);
  if v_max is null then return NEW; end if;

  perform pg_advisory_xact_lock(
    hashtext('document_quota'),
    hashtext(NEW.organisation_id::text)
  );

  select count(*) into v_used
    from documents
    where organisation_id = NEW.organisation_id
      and deleted_at is null;

  if v_used >= v_max then
    raise exception 'quota_exceeded: % plan caps documents at %', v_plan, v_max
      using errcode = 'P0001';
  end if;

  return NEW;
end
$$;

drop trigger if exists document_quota_check on documents;
create trigger document_quota_check
  before insert on documents
  for each row execute function enforce_document_quota();

-- =========================================================================
-- 4. OCR-per-month quota trigger
-- =========================================================================
-- Counts usage_log rows with metric='ocr_runs' for the current calendar
-- month (UTC). On insert of a new 'ocr_runs' row, take the lock, count,
-- raise if over. Other metrics (future: emails, exports) pass through
-- unchanged.
create or replace function enforce_ocr_monthly_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max int;
  v_used int;
  v_month_start timestamptz;
begin
  if NEW.metric is distinct from 'ocr_runs' then
    return NEW;
  end if;

  select plan into v_plan
    from organisations
    where id = NEW.organisation_id;
  v_max := plan_max_ocr_per_month(v_plan);
  if v_max is null then return NEW; end if;

  perform pg_advisory_xact_lock(
    hashtext('ocr_monthly_quota'),
    hashtext(NEW.organisation_id::text)
  );

  -- First day of the current UTC month.
  v_month_start := date_trunc('month', now() at time zone 'UTC');

  select count(*) into v_used
    from usage_log
    where organisation_id = NEW.organisation_id
      and metric = 'ocr_runs'
      and at >= v_month_start;

  if v_used >= v_max then
    raise exception 'quota_exceeded: % plan caps OCR runs at %/month', v_plan, v_max
      using errcode = 'P0001';
  end if;

  return NEW;
end
$$;

drop trigger if exists usage_log_ocr_quota_check on usage_log;
create trigger usage_log_ocr_quota_check
  before insert on usage_log
  for each row execute function enforce_ocr_monthly_quota();
