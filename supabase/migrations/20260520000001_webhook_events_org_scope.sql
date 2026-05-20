-- webhook_events tenant scoping fix.
--
-- Bug surfaced in PR #1 review: /admin/webhook-events was rendering
-- every org's Stripe event metadata (event_id, event_type, timestamps,
-- error messages) to any org owner. The table had no organisation_id
-- column at all — events were a global log.
--
-- This migration:
--   1. Adds organisation_id (nullable, with FK + index)
--   2. Backfills via metadata.organisation_id or stripe_customer_id
--   3. Adds RLS policies scoping owner/admin reads to their org
--      (writes remain service-role only)
--
-- Nullable because:
--   - Some events arrive before we know which org they belong to
--     (customer.created with no metadata yet)
--   - Unknown / unhandled event types stay attributable-when-possible
--
-- The webhook handler at app/api/webhooks/stripe/route.ts derives the
-- org_id at the same point it would have resolved one for the
-- subscription/customer/invoice handler, and writes it to the row.

set search_path = public;

-- =========================================================================
-- 1. Column + index
-- =========================================================================
alter table webhook_events
  add column if not exists organisation_id uuid references organisations(id)
    on update cascade on delete cascade;

create index if not exists webhook_events_organisation_id_idx
  on webhook_events (organisation_id, created_at desc);

-- =========================================================================
-- 2. Backfill historical rows
-- =========================================================================
-- a) subscription / customer events with metadata.organisation_id
update webhook_events
  set organisation_id = (payload->'data'->'object'->'metadata'->>'organisation_id')::uuid
  where organisation_id is null
    and payload->'data'->'object'->'metadata'->>'organisation_id' is not null
    and payload->'data'->'object'->'metadata'->>'organisation_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- b) anything with a `customer` field → look up via stripe_customer_id
update webhook_events w
  set organisation_id = o.id
  from organisations o
  where w.organisation_id is null
    and w.payload->'data'->'object'->>'customer' is not null
    and o.stripe_customer_id = w.payload->'data'->'object'->>'customer';

-- =========================================================================
-- 3. RLS policies
-- =========================================================================
-- Previously RLS was enabled with NO policies (service-role only). Now
-- we want owners + admins of the org to read their org's events via the
-- /admin/webhook-events page — but writes stay service-role only.

drop policy if exists "webhook_events_select_owner_admin" on webhook_events;
create policy "webhook_events_select_owner_admin" on webhook_events
  for select using (
    organisation_id is not null
    and organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

-- No INSERT/UPDATE/DELETE policies — writes remain service-role only
-- via the webhook handler. Service-role bypasses RLS regardless.

comment on column webhook_events.organisation_id is
  'Tenant-scope. Nullable for events received before resolution (e.g. customer.created without metadata). Set by the webhook handler at insert / first lookup time.';
