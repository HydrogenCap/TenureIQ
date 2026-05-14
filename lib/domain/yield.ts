// lib/domain/yield.ts

/**
 * Gross yield in basis points.
 * (annual rent / valuation) * 10000
 */
export function grossYieldBps(annualRentPence: bigint, valuationPence: bigint): number {
  if (valuationPence === 0n) return 0
  return Number((annualRentPence * 10000n) / valuationPence)
}

/**
 * Net yield in basis points after running costs.
 * ((annual rent - annual costs) / valuation) * 10000
 */
export function netYieldBps(
  annualRentPence: bigint,
  annualCostsPence: bigint,
  valuationPence: bigint
): number {
  if (valuationPence === 0n) return 0
  const net = annualRentPence - annualCostsPence
  return Number((net * 10000n) / valuationPence)
}

/**
 * Cash-on-cash return in basis points.
 * (annual net profit / cash invested) * 10000
 * Cash invested = deposit + acquisition costs + refurb.
 */
export function roiOnCashInBps(
  annualNetProfitPence: bigint,
  cashInvestedPence: bigint
): number {
  if (cashInvestedPence === 0n) return 0
  return Number((annualNetProfitPence * 10000n) / cashInvestedPence)
}
