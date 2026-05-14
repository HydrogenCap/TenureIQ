// lib/domain/icr.ts
// BTL lender affordability test.

export type BorrowerKind = 'individual_basic' | 'individual_higher' | 'company'

export type IcrInput = {
  monthlyRentPence: bigint
  balancePence: bigint
  payRateBps: number
  productYears: number
  borrowerKind: BorrowerKind
}

/**
 * Returns the bps stress rate to apply.
 * 5+ year fix: pay rate (no uplift, per PRA exception).
 * Otherwise: max(payRate + 200, 550).
 */
export function effectiveStressBps(input: IcrInput): number {
  if (input.productYears >= 5) return input.payRateBps
  return Math.max(input.payRateBps + 200, 550)
}

export type IcrResult = {
  stressBps: number
  monthlyInterestStressedPence: bigint
  ratio: number
  thresholdRatio: number
  passes: boolean
}

export function icr(input: IcrInput): IcrResult {
  const stressBps = effectiveStressBps(input)
  // monthly interest = balance * rate / 12, all integer math
  const monthlyInterestStressedPence = (input.balancePence * BigInt(stressBps)) / 10000n / 12n
  const ratio =
    monthlyInterestStressedPence === 0n
      ? Infinity
      : Number(input.monthlyRentPence) / Number(monthlyInterestStressedPence)
  const thresholdRatio = input.borrowerKind === 'individual_higher' ? 1.45 : 1.25
  return {
    stressBps,
    monthlyInterestStressedPence,
    ratio,
    thresholdRatio,
    passes: ratio >= thresholdRatio,
  }
}
