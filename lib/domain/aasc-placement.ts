// lib/domain/aasc-placement.ts
// Placement-level revenue + commission helpers. Pure, bigint
// arithmetic. The schema enforces "no service-user identity"; nothing
// here ever touches names / DoB / nationality.

export type PlacementLike = {
  weeklyRatePence: bigint
  serviceUserCount: number
  commissionRateBpsOverride: number | null
  // Active = no end_date_actual yet. Ended placements still appear in
  // the historical revenue figure if you pass them in.
  endDateActual: Date | string | null
}

export type ContractCommission = {
  // Default contract-level commission, used when the placement override
  // is null. Stored as basis points (e.g. 1500 = 15%).
  commissionRateBps: number
}

// Gross per-week BEFORE the contractor's commission.
export function placementGrossPerWeekPence(input: {
  weeklyRatePence: bigint
  serviceUserCount: number
}): bigint {
  if (input.serviceUserCount <= 0) return 0n
  return input.weeklyRatePence * BigInt(input.serviceUserCount)
}

// Net per-week AFTER the commission. Uses the placement override if
// set, otherwise the contract's default rate.
export function placementNetPerWeekPence(input: {
  weeklyRatePence: bigint
  serviceUserCount: number
  commissionRateBpsOverride: number | null
  contractCommissionRateBps: number
}): bigint {
  const gross = placementGrossPerWeekPence({
    weeklyRatePence: input.weeklyRatePence,
    serviceUserCount: input.serviceUserCount,
  })
  const rate =
    input.commissionRateBpsOverride !== null
      ? input.commissionRateBpsOverride
      : input.contractCommissionRateBps
  // gross * (10000 - commission) / 10000
  return (gross * BigInt(10_000 - rate)) / 10_000n
}

// Sum of (net per week * 52) across the placements that are active as
// of `asOf` — i.e. end_date_actual is null OR in the future.
export function propertyAascRevenueAnnualPence(input: {
  placements: PlacementLike[]
  contractCommissionRateBps: number
  asOf?: Date
}): bigint {
  const asOf = input.asOf ?? new Date()
  let total = 0n
  for (const p of input.placements) {
    const ended =
      p.endDateActual !== null &&
      new Date(p.endDateActual) < asOf
    if (ended) continue
    const weekly = placementNetPerWeekPence({
      weeklyRatePence: p.weeklyRatePence,
      serviceUserCount: p.serviceUserCount,
      commissionRateBpsOverride: p.commissionRateBpsOverride,
      contractCommissionRateBps: input.contractCommissionRateBps,
    })
    total += weekly * 52n
  }
  return total
}
