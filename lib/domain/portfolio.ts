// lib/domain/portfolio.ts
// Portfolio-level rollups across properties and mortgages.

export type PropertyMortgageRollup = {
  // Latest valuation or fall back to purchase price.
  valuePence: bigint
  // Sum of current balances across all undeleted mortgages on this property.
  debtPence: bigint
}

// Weighted average LTV across a portfolio of properties.
// Returns null if total value is 0.
//
// Formula: sum(debt) / sum(value) × 10000 (basis points).
// This is the standard "by value" weighting — equivalent to
// sum(individual LTV × value) / sum(value), but cheaper to compute.
export function weightedAverageLtvBps(
  rollups: PropertyMortgageRollup[],
): number | null {
  const totalValue = rollups.reduce((sum, r) => sum + r.valuePence, 0n)
  const totalDebt = rollups.reduce((sum, r) => sum + r.debtPence, 0n)
  if (totalValue === 0n) return null
  return Number((totalDebt * 10_000n) / totalValue)
}

// Aggregate equity and value totals — common dashboard query.
export function portfolioTotals(rollups: PropertyMortgageRollup[]): {
  totalValuePence: bigint
  totalDebtPence: bigint
  totalEquityPence: bigint
} {
  const totalValuePence = rollups.reduce((sum, r) => sum + r.valuePence, 0n)
  const totalDebtPence = rollups.reduce((sum, r) => sum + r.debtPence, 0n)
  return {
    totalValuePence,
    totalDebtPence,
    totalEquityPence: totalValuePence - totalDebtPence,
  }
}
