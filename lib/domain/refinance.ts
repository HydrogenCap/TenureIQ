// lib/domain/refinance.ts

import { monthlyInterestPence } from './mortgage'

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

// ---------------------------------------------------------------------------
// What-if scenario modelling (mortgage detail page calculator).
// ---------------------------------------------------------------------------


// Standard PRA-style ICR threshold used by the what-if calculator:
// 125% (12500 bps). The full icr() helper above (lib/domain/icr.ts)
// distinguishes higher-rate individuals (145%); the calculator uses the
// baseline because the mortgage page doesn't know the borrower's tax band.
export const ICR_THRESHOLD_BPS = 12500

// Repayment-mortgage annuity: M = P·r·(1+r)^n / ((1+r)^n − 1), r = monthly rate.
//
// Precision note (WHY Number, not bigint): the formula needs real
// exponentiation, which bigint cannot express. IEEE-754 doubles carry
// ~15 significant digits — a £100m principal is 10^10 pence, leaving
// 5 digits of headroom, so the error before rounding is far below a
// penny. Quoted payments don't need sub-penny exactness anyway (lenders
// themselves round), so we compute in Number and round once to bigint
// pence at the end. Money never leaves this function as a float.
export function annuityMonthlyPaymentPence({
  principalPence,
  annualRateBps,
  termMonths,
}: {
  principalPence: bigint
  annualRateBps: number
  termMonths: number
}): bigint {
  if (principalPence < 0n) throw new RangeError('principalPence must be >= 0')
  if (annualRateBps < 0) throw new RangeError('annualRateBps must be >= 0')
  if (!Number.isInteger(termMonths) || termMonths < 1)
    throw new RangeError('termMonths must be a positive integer')

  const principal = Number(principalPence)
  if (annualRateBps === 0) {
    // Zero-rate degenerate case: the annuity formula divides by zero, so
    // fall back to straight-line principal repayment.
    return BigInt(Math.round(principal / termMonths))
  }
  const monthlyRate = annualRateBps / 10_000 / 12
  const growth = Math.pow(1 + monthlyRate, termMonths)
  const payment = (principal * monthlyRate * growth) / (growth - 1)
  return BigInt(Math.round(payment))
}

export type RefinanceScenarioInput = {
  currentBalancePence: bigint
  currentRateBps: number
  currentMonthlyPaymentPence: bigint
  currentIsInterestOnly: boolean
  candidateRateBps: number
  candidateTermMonths: number
  candidateIsInterestOnly: boolean
  arrangementFeePence: bigint
  addFeeToLoan: boolean
  ercPence: bigint
  monthlyRentPence: bigint
}

export type RefinanceScenarioResult = {
  newLoanPence: bigint
  newMonthlyPaymentPence: bigint
  // new − current: negative means the candidate product is cheaper.
  monthlyDeltaPence: bigint
  // Rent ÷ monthly interest at the candidate pay rate, in bps
  // (21333 = 213.33%). null when interest is zero (rate 0).
  icrBps: number | null
  icrPasses: boolean
  stressBps: number
  stressedIcrBps: number | null
  stressedIcrPasses: boolean
  // Months of saving needed to recoup upfront cost (ERC + fee unless the
  // fee is added to the loan). null when the scenario doesn't save money.
  breakEvenMonths: number | null
}

// ICR on an interest-only basis, expressed in bps. Matches the icr()
// convention in lib/domain/icr.ts: monthly interest = balance × rate ÷
// 10000 ÷ 12, ratio = rent ÷ interest — here scaled ×10000 so the
// result stays integer (no floats near money).
function icrBpsAt(monthlyRentPence: bigint, balancePence: bigint, rateBps: number): number | null {
  const interest = monthlyInterestPence(balancePence, rateBps)
  if (interest === 0n) return null
  return Number((monthlyRentPence * 10_000n) / interest)
}

export function refinanceScenario(input: RefinanceScenarioInput): RefinanceScenarioResult {
  if (input.currentBalancePence < 0n) throw new RangeError('currentBalancePence must be >= 0')
  if (input.arrangementFeePence < 0n) throw new RangeError('arrangementFeePence must be >= 0')
  if (input.ercPence < 0n) throw new RangeError('ercPence must be >= 0')
  if (input.candidateRateBps < 0) throw new RangeError('candidateRateBps must be >= 0')

  const newLoanPence =
    input.currentBalancePence + (input.addFeeToLoan ? input.arrangementFeePence : 0n)

  const newMonthlyPaymentPence = input.candidateIsInterestOnly
    ? monthlyInterestPence(newLoanPence, input.candidateRateBps)
    : annuityMonthlyPaymentPence({
        principalPence: newLoanPence,
        annualRateBps: input.candidateRateBps,
        termMonths: input.candidateTermMonths,
      })

  // If the stored current payment is zero but the loan is interest-only,
  // derive it from balance × rate so the delta isn't nonsense — mortgages
  // imported without a payment amount are common.
  const currentPayment =
    input.currentMonthlyPaymentPence === 0n && input.currentIsInterestOnly
      ? monthlyInterestPence(input.currentBalancePence, input.currentRateBps)
      : input.currentMonthlyPaymentPence

  const monthlyDeltaPence = newMonthlyPaymentPence - currentPayment

  // ICR is always assessed on an interest-only basis (lender convention —
  // repayment mortgages are stress-tested on the interest element).
  const icrBps = icrBpsAt(input.monthlyRentPence, newLoanPence, input.candidateRateBps)
  // Stress convention mirrors effectiveStressBps in lib/domain/icr.ts:
  // pay rate + 200bps with a 5.50% floor. We deliberately skip the
  // 5-year-fix exception — a what-if candidate has no known fix length.
  const stressBps = Math.max(input.candidateRateBps + 200, 550)
  const stressedIcrBps = icrBpsAt(input.monthlyRentPence, newLoanPence, stressBps)

  // Break-even: upfront cash out ÷ monthly saving, rounded up. A fee
  // rolled into the loan is not upfront cash (it costs interest instead,
  // which the new payment already reflects).
  const upfrontCostPence = input.ercPence + (input.addFeeToLoan ? 0n : input.arrangementFeePence)
  const savingPence = -monthlyDeltaPence
  const breakEvenMonths =
    savingPence > 0n
      ? Number((upfrontCostPence + savingPence - 1n) / savingPence) // ceil division
      : null

  return {
    newLoanPence,
    newMonthlyPaymentPence,
    monthlyDeltaPence,
    icrBps,
    icrPasses: icrBps !== null && icrBps >= ICR_THRESHOLD_BPS,
    stressBps,
    stressedIcrBps,
    stressedIcrPasses: stressedIcrBps !== null && stressedIcrBps >= ICR_THRESHOLD_BPS,
    breakEvenMonths,
  }
}
