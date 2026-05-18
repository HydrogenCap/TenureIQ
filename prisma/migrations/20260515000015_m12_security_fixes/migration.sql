-- TenureIQ M12 follow-up — migration-reviewer findings on
-- 20260515000014_m12_billing/migration.sql.
--
--   P0  organisations.plan_status CHECK was missing the three
--       Stripe `incomplete*` / `unpaid` statuses. A webhook
--       mirroring `incomplete_expired` would fail with a CHECK
--       violation and Stripe would hard-retry forever.
--   P0  usage_log.metric CHECK only allowed two of the four
--       documented metrics. emails_sent / reports_generated
--       writes from M6 cron + M10 report email would throw.
--   P0  webhook_events.payload retains the Stripe-Signature
--       header by default. RLS-with-no-policies hides it from
--       end users today, but the table will flow through any
--       future logical-replication consumer / supabase_realtime
--       publication. Strip the header at insert time and drop
--       the table from the realtime publication defensively.
--   P1  organisations_default_trial trigger has no escape
--       hatch — bulk imports, fixture seeds, and the future
--       "downgrade to free on trial end" path silently re-arm
--       a trial. Guard with current_setting and a
--       stripe_customer_id null check.
--   P1  default_organisation_trial() function was defined
--       inside the trigger-existence IF block, so a
--       partially-applied migration could leave a stale function
--       body. Move CREATE OR REPLACE FUNCTION outside the IF.
--   P2  subscriptions table had only a SELECT policy. Convention
--       wants the full four-policy template even when all writes
--       go via service role — makes the "no user writes"
--       contract auditable.
--   P2  usage_log lacks the standard timestamp columns; document
--       the deviation in a table comment.

set search_path = public;

-- =========================================================================
-- 1. organisations.plan_status — widen the CHECK to cover the full
--    Stripe set. Drop + recreate is the safe pattern for CHECK changes.
-- =========================================================================

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'organisations_plan_status_check'
      and conrelid = 'organisations'::regclass
  ) then
    alter table organisations drop constraint organisations_plan_status_check;
  end if;
end$$;

alter table organisations
  add constraint organisations_plan_status_check
  check (plan_status in (
    'trialing', 'active', 'past_due', 'canceled', 'paused',
    'incomplete', 'incomplete_expired', 'unpaid'
  ));

comment on column organisations.plan_status is
  'Mirrors Stripe subscription.status verbatim (8 values). Read-only-after-7-days enforcement on past_due is in lib/billing/can.ts.';

-- =========================================================================
-- 2. usage_log.metric — widen to include emails_sent + reports_generated.
-- =========================================================================

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'usage_log_metric_check'
      and conrelid = 'usage_log'::regclass
  ) then
    alter table usage_log drop constraint usage_log_metric_check;
  end if;
end$$;

alter table usage_log
  add constraint usage_log_metric_check
  check (metric in (
    'ocr_runs', 'documents_uploaded', 'emails_sent', 'reports_generated'
  ));

comment on table usage_log is
  'Append-only meter for plan-gate enforcement. Intentionally lacks the standard created_at/updated_at/deleted_at columns (single timestamp `at` is sufficient; rows are never edited or soft-deleted). Service-role-only writes per the lib/billing/can.ts contract.';

-- =========================================================================
-- 3. webhook_events — strip Stripe-Signature header at insert time.
--    Also drop from supabase_realtime publication defensively.
-- =========================================================================

create or replace function public.strip_webhook_signature_headers()
returns trigger
language plpgsql
as $$
begin
  -- The payload jsonb shouldn't contain headers in normal handler use
  -- (we only insert the Stripe `event` object), but defence in depth
  -- against any future code path that persists the raw HTTP request.
  if NEW.payload ? 'Stripe-Signature' then
    NEW.payload := NEW.payload - 'Stripe-Signature';
  end if;
  if NEW.payload ? 'stripe-signature' then
    NEW.payload := NEW.payload - 'stripe-signature';
  end if;
  if NEW.payload ? 'headers' then
    -- Nested under .headers — strip just the signature, keep the rest.
    NEW.payload := jsonb_set(
      NEW.payload,
      '{headers}',
      (NEW.payload->'headers') - 'Stripe-Signature' - 'stripe-signature'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists webhook_events_strip_signature on webhook_events;
create trigger webhook_events_strip_signature
  before insert or update on webhook_events
  for each row execute function strip_webhook_signature_headers();

-- Defensively exclude webhook_events from any realtime publication.
-- alter publication ... drop table errors if the table isn't in the
-- publication, so wrap in a guard.
do $$
declare
  pub_exists boolean;
begin
  select exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) into pub_exists;
  if pub_exists and exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'webhook_events'
  ) then
    alter publication supabase_realtime drop table webhook_events;
  end if;
end$$;

-- =========================================================================
-- 4. organisations_default_trial — move function CREATE OR REPLACE
--    outside the IF block AND add an escape hatch.
-- =========================================================================

create or replace function public.default_organisation_trial()
returns trigger
language plpgsql
as $$
begin
  -- Escape hatches:
  --   1. stripe_customer_id already set on insert (e.g. an admin
  --      bulk-import seeded a real customer).
  --   2. session variable app.skip_default_trial = 'on' (lets
  --      `set local app.skip_default_trial = 'on'` inside a
  --      migration or admin tool opt out).
  --   3. Plan is already non-free at insert time.
  if NEW.stripe_customer_id is not null then
    return NEW;
  end if;
  if current_setting('app.skip_default_trial', true) = 'on' then
    return NEW;
  end if;
  if NEW.plan is not null and NEW.plan != 'free' then
    return NEW;
  end if;

  -- Otherwise: 14-day Growth trial.
  NEW.plan := 'growth';
  NEW.plan_status := 'trialing';
  NEW.trial_ends_at := now() + interval '14 days';
  NEW.plan_renews_at := NEW.trial_ends_at;
  return NEW;
end;
$$;

-- (Trigger may already exist from the previous migration; this is
-- idempotent.)
drop trigger if exists organisations_default_trial on organisations;
create trigger organisations_default_trial
  before insert on organisations
  for each row execute function default_organisation_trial();

-- =========================================================================
-- 5. subscriptions — fill in the four-policy template.
--    All writes go via service role (webhook handler); these explicit
--    `using (false) / with check (false)` policies make the contract
--    auditable and survive a future accidental grant.
-- =========================================================================

drop policy if exists "subscriptions_insert" on subscriptions;
create policy "subscriptions_insert" on subscriptions
  for insert
  with check (false);

drop policy if exists "subscriptions_update" on subscriptions;
create policy "subscriptions_update" on subscriptions
  for update
  using (false)
  with check (false);

drop policy if exists "subscriptions_delete" on subscriptions;
create policy "subscriptions_delete" on subscriptions
  for delete
  using (false);

comment on table subscriptions is
  'Mirror of Stripe subscriptions. RLS allows owner/admin SELECT for the in-app billing surface. Writes are denied for all roles by RLS — the Stripe webhook handler runs as service role and bypasses RLS. The explicit `false` policies on insert/update/delete document this contract.';
