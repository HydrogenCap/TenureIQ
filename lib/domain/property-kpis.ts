// lib/domain/property-kpis.ts
// Pure aggregator producing the four KPI tiles shown on the property detail
// header. No I/O — callers fetch the inputs and pass them in.

import { equity, ltvBps } from './equity'

export type PropertyKpiInput = {
  purchasePricePence: bigint
  currentValuationPence: bigint | null
  acquisitionCostsPence: bigint | null
  refurbCostPence: bigint | null
  sdltPaidPence: bigint | null
  // Sum of current outstanding balances across all live mortgages on the property.
  mortgageBalancePence: bigint | null
  // Sum of weekly rent across active tenancies (already in pence/week).
  weeklyRentRollPence: bigint | null
}

export type PropertyKpis = {
  // Current value (falls back to purchase price if not yet valued).
  valuePence: bigint
  // Equity = valuation − debt. Can be negative if upside-down.
  equityPence: bigint
  // LTV in basis points. Returns 0 if no debt; null if no valuation.
  ltvBps: number | null
  // Gross yield in basis points = (weekly rent × 52 / value) × 10000.
  // Returns null if no rent roll or no value.
  grossYieldBps: number | null
  // Sum of purchase + sdlt + refurb + acquisition extras.
  allInCostPence: bigint
}

export function propertyKpis(input: PropertyKpiInput): PropertyKpis {
  const value = input.currentValuationPence ?? input.purchasePricePence
  const debt = input.mortgageBalancePence ?? 0n

  const equityPence = equity({ valuationPence: value, balancePence: debt })

  const ltv =
    input.currentValuationPence === null
      ? null
      : debt === 0n
        ? 0
        : ltvBps({ valuationPence: input.currentValuationPence, balancePence: debt })

  let grossYieldBps: number | null = null
  if (input.weeklyRentRollPence !== null && input.weeklyRentRollPence > 0n && value > 0n) {
    // (annualRent / value) * 10000 — keep precision via bigint math.
    const annualRent = input.weeklyRentRollPence * 52n
    grossYieldBps = Number((annualRent * 10000n) / value)
  }

  const allInCostPence =
    input.purchasePricePence +
    (input.sdltPaidPence ?? 0n) +
    (input.refurbCostPence ?? 0n) +
    (input.acquisitionCostsPence ?? 0n)

  return {
    valuePence: value,
    equityPence,
    ltvBps: ltv,
    grossYieldBps,
    allInCostPence,
  }
}
