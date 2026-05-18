-- TenureIQ M12 — Billing (Stripe).
--
-- Adds plan + billing-related columns to organisations, plus three
-- new tables:
--   subscriptions   — mirror of Stripe subscription state. Service-
--                     role writes only (webhook handler at
--                     app/api/webhooks/stripe/).
--   webhook_events  — idempotency log for inbound webhooks (Stripe,
--                     and any future providers). Owner-readable.
--   usage_log       — per-organisation usage meter. Service-role
--                     writes (the OCR job + document upload action);
--                     owner SELECT for limit-display purposes.
--
-- The Stripe SDK itself is intentionally NOT installed here — the
-- webhook signature is verified using node:crypto.timingSafeEqual
-- against the documented `t=…,v1=…` signature header. The
-- lib/stripe/client.ts call sites are stubbed behind an interface so
-- swapping in `npm i stripe` later is a single-file change.

set search_path = public;

-- =========================================================================
-- 1. organisations: plan + plan_status + plan_renews_at + stripe_customer_id
-- =========================================================================

alter table organisations
  add column if not exists plan text not null default 'free',
  add column if not exists plan_status text not null default 'active',
  add column if not exists plan_renews_at timestamptz(6),
  add column if not exists stripe_customer_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organisations_plan_check'
      and conrelid = 'organisations'::regclass
  ) then
    alter table organisations
      add constraint organisations_plan_check
      check (plan in ('free','starter','growth','pro','enterprise'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'organisations_plan_status_check'
      and conrelid = 'organisations'::regclass
  ) then
    alter table organisations
      add constraint organisations_plan_status_check
      check (plan_status in ('trialing','active','past_due','canceled','paused'));
  end if;
end$$;

create unique index if not exists organisations_stripe_customer_id_unique
  on organisations(stripe_customer_id)
  where stripe_customer_id is not null;

-- =========================================================================
-- 2. subscriptions — Stripe subscription mirror
-- =========================================================================

create table if not exists subscriptions (
  id                       uuid       not null primary key default gen_random_uuid(),
  organisation_id          uuid       not null references organisations(id) on update cascade on delete restrict,

  stripe_subscription_id   text       not null unique,
  stripe_price_id          text       not null,
  status                   text       not null check (status in (
    'trialing','active','past_due','canceled','paused',
    'incomplete','incomplete_expired','unpaid'
  )),
  current_period_start     timestamptz(6) not null,
  current_period_end       timestamptz(6) not null,
  cancel_at_period_end     boolean    not null default false,
  metadata                 jsonb      not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),

  created_at               timestamptz(6) not null default current_timestamp,
  updated_at               timestamptz(6) not null default current_timestamp,
  deleted_at               timestamptz(6)
);

create index if not exists subscriptions_organisation_id_idx on subscriptions(organisation_id);
create index if not exists subscriptions_organisation_status_idx on subscriptions(organisation_id, status);

alter table subscriptions enable row level security;

-- Owners can SELECT their org's subscription. Writes happen exclusively
-- through the webhook handler in lib/jobs / app/api/webhooks (service
-- role bypasses RLS). No INSERT / UPDATE / DELETE policies for the
-- user-facing client.
create policy "subscriptions_select" on subscriptions
  for select using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

create trigger subscriptions_audit
  after insert or update or delete on subscriptions
  for each row execute function audit_log_trigger();

-- =========================================================================
-- 3. webhook_events — idempotency log
-- =========================================================================

create table if not exists webhook_events (
  id            uuid           not null primary key default gen_random_uuid(),
  provider      text           not null check (provider in ('stripe')),
  event_id      text           not null unique,
  event_type    text           not null,
  payload       jsonb          not null,
  processed_at  timestamptz(6),
  error         text,

  created_at    timestamptz(6) not null default current_timestamp
);

create index if not exists webhook_events_event_type_idx on webhook_events(event_type);
create index if not exists webhook_events_provider_processed_idx on webhook_events(provider, processed_at);

alter table webhook_events enable row level security;

-- No policies — service-role only. Owners don't see webhook payloads
-- (they can leak signature material).
comment on table webhook_events is
  'Inbound webhook idempotency log. RLS enabled, NO policies. '
  'Writes via app/api/webhooks/* (service role). Reads (e.g. for an '
  'admin diagnostic page) also via lib/admin/* helpers. Payload may '
  'contain Stripe signature headers — never expose to the user-facing '
  'client.';

-- =========================================================================
-- 4. usage_log — per-org metered usage
-- =========================================================================

create table if not exists usage_log (
  id              bigserial     primary key,
  organisation_id uuid          not null references organisations(id) on update cascade on delete restrict,
  metric          text          not null check (metric in ('ocr_runs','documents_uploaded')),
  at              timestamptz(6) not null default current_timestamp,
  count           int           not null default 1 check (count > 0)
);

create index if not exists usage_log_org_metric_at_idx on usage_log(organisation_id, metric, at);

alter table usage_log enable row level security;

-- Owners can SELECT for their own org (so the settings page can show
-- "X / Y OCR runs this month"). Writes via lib/admin/usage.ts
-- (service role), as the OCR job and the document upload action run
-- service-role-ish.
create policy "usage_log_select" on usage_log
  for select using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  );

-- =========================================================================
-- 5. Onboarding hook — new orgs default to a 14-day Growth trial.
--    The application-layer hook (lib/billing/onboarding.ts) is the
--    primary path, but we add a DB-level default so a manually-
--    created org via the SQL editor also gets the trial.
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'organisations_default_trial'
      and tgrelid = 'organisations'::regclass
  ) then
    create or replace function default_organisation_trial()
    returns trigger language plpgsql as $f$
    begin
      if NEW.plan is null or NEW.plan = 'free' then
        if NEW.trial_ends_at is null then
          NEW.trial_ends_at := current_date + interval '14 days';
        end if;
        if NEW.plan = 'free' and NEW.plan_status = 'active' then
          NEW.plan := 'growth';
          NEW.plan_status := 'trialing';
          NEW.plan_renews_at := NEW.trial_ends_at;
        end if;
      end if;
      return NEW;
    end;
    $f$;
    create trigger organisations_default_trial
      before insert on organisations
      for each row execute function default_organisation_trial();
  end if;
end$$;
