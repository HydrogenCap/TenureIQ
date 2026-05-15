-- TenureIQ M4 — Mortgages & Valuations schema additions.
--
-- Pure-additive. The mortgages / mortgage_events / valuations tables
-- themselves are from the M0 init. Their RLS + audit triggers are from
-- the initial_rls migration, which also set the `mortgages.product` and
-- `valuations.kind` CHECK constraints. This migration only adds:
--   - composite indexes used by the detail-page reads
--   - a CHECK constraint enumerating `mortgage_events.kind` (newly
--     enumerated in M4; the kind list grew from 5 to 8 to support
--     payment_interest_only, product_switch, and reconciliation).

set search_path = public;

-- =========================================================================
-- 1. Indexes for ledger + history reads.
-- =========================================================================

create index if not exists valuations_property_date_idx
  on valuations (property_id, valuation_date desc)
  where deleted_at is null;

create index if not exists mortgage_events_mortgage_date_idx
  on mortgage_events (mortgage_id, event_date desc);

-- =========================================================================
-- 2. mortgage_events.kind CHECK (matches MORTGAGE_EVENT_KINDS in
--    lib/schemas/mortgage.ts — 8 values, append-only history).
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
