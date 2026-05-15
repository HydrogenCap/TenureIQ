-- TenureIQ M4 — Mortgages & Valuations schema additions.
--
-- The mortgage / mortgage_events / valuation tables themselves already
-- exist from the M0 init. This migration tightens the operational
-- shape:
--   - valuations gets a composite index on (property_id, valuation_date DESC)
--     so detail-page "latest valuation" reads stay fast at scale.
--   - mortgage_events gets event_date / (mortgage_id, event_date) indexes
--     for the ledger view that orders by date desc.
--   - mortgage_events CHECK constraint enumerates allowed kinds.
--   - valuations CHECK constraint enumerates allowed kinds.

set search_path = public;

-- =========================================================================
-- 1. Indexes for ledger + history reads.
-- =========================================================================

create index if not exists valuations_property_date_idx
  on valuations (property_id, valuation_date desc)
  where deleted_at is null;

create index if not exists mortgage_events_mortgage_date_idx
  on mortgage_events (mortgage_id, event_date desc);

create index if not exists mortgage_events_event_date_idx
  on mortgage_events (event_date);

-- =========================================================================
-- 2. Enumerate allowed kinds via CHECK (matches the lib/schemas/* enums).
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mortgage_events_kind_check'
      and conrelid = 'mortgage_events'::regclass
  ) then
    alter table mortgage_events
      add constraint mortgage_events_kind_check
      check (kind in (
        'drawdown', 'payment', 'payment_interest_only',
        'rate_change', 'product_switch', 'redemption',
        'er_charge', 'reconciliation'
      ));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'valuations_kind_check'
      and conrelid = 'valuations'::regclass
  ) then
    alter table valuations
      add constraint valuations_kind_check
      check (kind in (
        'estimate', 'estate_agent', 'red_book',
        'refinance', 'purchase', 'desktop'
      ));
  end if;
end$$;

-- =========================================================================
-- 3. Mortgage product CHECK.
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mortgages_product_check'
      and conrelid = 'mortgages'::regclass
  ) then
    alter table mortgages
      add constraint mortgages_product_check
      check (product in (
        'fixed', 'tracker', 'svr', 'discount', 'bridging', 'development'
      ));
  end if;
end$$;
