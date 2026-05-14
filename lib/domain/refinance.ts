// lib/domain/refinance.ts

export type RefinanceInput = {
  valuationPence: bigint
  currentBalancePence: bigint
  monthlyRentPence: bigint
  maxLtvBps: number // e.g. 7500 for 75%
  stressBps: number
  thresholdBps: number // 12500 for 125%, 14500 for 145%
}

export type RefinanceResult = {
  maxLoanByLtvPence: bigint
  maxLoanByIcrPence: bigint
  maxLoanPence: bigint
  headroomPence: bigint
  bindingConstraint: 'ltv' | 'icr'
}

export function maxLoanByLtvPence(valuationPence: bigint, maxLtvBps: number): bigint {
  return (valuationPence * BigInt(maxLtvBps)) / 10000n
}

export function maxLoanByIcrPence(
  monthlyRentPence: bigint,
  stressBps: number,
  thresholdBps: number
): bigint {
  if (stressBps === 0 || thresholdBps === 0) return 0n
  const maxStressedMonthly = (monthlyRentPence * 10000n) / BigInt(thresholdBps)
  // balance such that balance * stressBps / 10000 / 12 = maxStressedMonthly
  return (maxStressedMonthly * 12n * 10000n) / BigInt(stressBps)
}

export function refinanceHeadroom(input: RefinanceInput): RefinanceResult {
  const byLtv = maxLoanByLtvPence(input.valuationPence, input.maxLtvBps)
  const byIcr = maxLoanByIcrPence(
    input.monthlyRentPence,
    input.stressBps,
    input.thresholdBps
  )
  const maxLoan = byLtv < byIcr ? byLtv : byIcr
  return {
    maxLoanByLtvPence: byLtv,
    maxLoanByIcrPence: byIcr,
    maxLoanPence: maxLoan,
    headroomPence: maxLoan - input.currentBalancePence,
    bindingConstraint: byLtv < byIcr ? 'ltv' : 'icr',
  }
}
