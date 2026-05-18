-- Quota-helper hygiene fix-ups for migration 20260515000019.
--
-- Migration-reviewer P1 findings:
--   - The plan_max_* helpers are declared IMMUTABLE, which is a forever
--     contract. We anticipate a future refactor that reads from a plans
--     table, at which point IMMUTABLE becomes a lie. Downgrade now to
--     STABLE while no index expressions depend on them.
--   - Defaultly PUBLIC gets EXECUTE on new functions. The helpers don't
--     leak anything sensitive but the convention is to lock down and
--     re-grant.
--
-- Also adds the per-function comments the codebase convention asks for.

set search_path = public;

-- =========================================================================
-- 1. Redefine helpers as STABLE (and re-grant)
-- =========================================================================
create or replace function plan_max_properties(p_plan text)
returns int
language sql
stable
parallel safe
as $$
  select case p_plan
    when 'free' then 3
    when 'starter' then 10
    when 'growth' then 50
    when 'pro' then 250
    else null
  end;
$$;

create or replace function plan_max_documents(p_plan text)
returns int
language sql
stable
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
stable
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
-- 2. Lock down + re-grant the helpers
-- =========================================================================
revoke all on function plan_max_properties(text) from public;
revoke all on function plan_max_documents(text) from public;
revoke all on function plan_max_ocr_per_month(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function plan_max_properties(text) to authenticated';
    execute 'grant execute on function plan_max_documents(text) to authenticated';
    execute 'grant execute on function plan_max_ocr_per_month(text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function plan_max_properties(text) to service_role';
    execute 'grant execute on function plan_max_documents(text) to service_role';
    execute 'grant execute on function plan_max_ocr_per_month(text) to service_role';
  end if;
end$$;

-- =========================================================================
-- 3. Comments on the trigger + helper functions for auditability
-- =========================================================================
comment on function plan_max_properties(text) is
  'STABLE. Returns the max property count for a plan id, null = unlimited. Mirrored from lib/billing/plans.ts.';
comment on function plan_max_documents(text) is
  'STABLE. Returns the max document count for a plan id, null = unlimited. Mirrored from lib/billing/plans.ts.';
comment on function plan_max_ocr_per_month(text) is
  'STABLE. Returns the monthly OCR-run cap for a plan id, null = unlimited. Mirrored from lib/billing/plans.ts.';

comment on function enforce_property_quota() is
  'BEFORE INSERT trigger on properties. Takes a transaction-scoped advisory lock per (resource, org) and raises sqlstate P0001 if the count would exceed the plan cap.';
comment on function enforce_document_quota() is
  'BEFORE INSERT trigger on documents. Same shape as enforce_property_quota.';
comment on function enforce_ocr_monthly_quota() is
  'BEFORE INSERT trigger on usage_log (metric=ocr_runs only). Counts within the current UTC calendar month under a per-org advisory lock.';
