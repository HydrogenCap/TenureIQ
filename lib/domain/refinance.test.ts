import { describe, it, expect } from 'vitest'
import {
  maxLoanByLtvPence,
  maxLoanByIcrPence,
  refinanceHeadroom,
  annuityMonthlyPaymentPence,
  refinanceScenario,
  ICR_THRESHOLD_BPS,
} from './refinance'

describe('maxLoanByLtvPence', () => {
  it('75% LTV of £200k = £150k', () => {
    expect(maxLoanByLtvPence(200_000_00n, 7500)).toBe(150_000_00n)
  })

  it('100% LTV passes through', () => {
    expect(maxLoanByLtvPence(200_000_00n, 10_000)).toBe(200_000_00n)
  })

  it('0 LTV returns 0', () => {
    expect(maxLoanByLtvPence(200_000_00n, 0)).toBe(0n)
  })
})

describe('maxLoanByIcrPence', () => {
  it('returns 0 when stressBps is 0 (avoids divide by zero)', () => {
    expect(maxLoanByIcrPence(1_000_00n, 0, 14500)).toBe(0n)
  })

  it('returns 0 when thresholdBps is 0', () => {
    expect(maxLoanByIcrPence(1_000_00n, 525, 0)).toBe(0n)
  })

  it('£1,000/month rent at 5.5% stress and 145% threshold ≈ £150k balance', () => {
    // monthlyRent / threshold = max stressed monthly interest payment
    // maxStressed = 1000 / 1.45 ≈ 689.66
    // 689.66 = balance * 0.055 / 12 → balance ≈ 689.66 * 12 / 0.055 ≈ 150,471
    const r = maxLoanByIcrPence(1_000_00n, 550, 14_500)
    // Integer-truncating arithmetic; allow tolerance.
    const expectedPounds = Number(r) / 100
    expect(expectedPounds).toBeGreaterThan(150_000)
    expect(expectedPounds).toBeLessThan(151_000)
  })
})

describe('refinanceHeadroom', () => {
  it('reports LTV-binding when LTV is the smaller cap', () => {
    // Tiny valuation, generous ICR → LTV binds.
    const r = refinanceHeadroom({
      valuationPence: 100_000_00n,
      currentBalancePence: 50_000_00n,
      monthlyRentPence: 5_000_00n,
      maxLtvBps: 7500,
      stressBps: 550,
      thresholdBps: 14_500,
    })
    expect(r.bindingConstraint).toBe('ltv')
    expect(r.maxLoanPence).toBe(75_000_00n)
    expect(r.headroomPence).toBe(25_000_00n)
  })

  it('reports ICR-binding when rent roll is the smaller cap', () => {
    // Huge LTV cap but thin rent → ICR binds.
    const r = refinanceHeadroom({
      valuationPence: 1_000_000_00n,
      currentBalancePence: 100_000_00n,
      monthlyRentPence: 500_00n, // £500/mo
      maxLtvBps: 7500,
      stressBps: 550,
      thresholdBps: 14_500,
    })
    expect(r.bindingConstraint).toBe('icr')
    expect(r.maxLoanPence).toBe(r.maxLoanByIcrPence)
    expect(r.headroomPence).toBe(r.maxLoanByIcrPence - 100_000_00n)
  })

  it('can return a negative headroom (overborrowed)', () => {
    const r = refinanceHeadroom({
      valuationPence: 100_000_00n,
      currentBalancePence: 90_000_00n, // higher than 75% LTV cap
      monthlyRentPence: 5_000_00n,
      maxLtvBps: 7500,
      stressBps: 550,
      thresholdBps: 14_500,
    })
    expect(r.headroomPence).toBe(-15_000_00n)
  })
})

describe('annuityMonthlyPaymentPence', () => {
  it('£100,000 at 5% over 300 months ≈ £584.59/mo (±1p)', () => {
    const p = annuityMonthlyPaymentPence({
      principalPence: 100_000_00n,
      annualRateBps: 500,
      termMonths: 300,
    })
    // Formula anchor: 100000 × (0.05/12) × 1.05^~ / (…) = 584.5903…
    expect(Number(p - 584_59n)).toBeLessThanOrEqual(1)
    expect(Number(584_59n - p)).toBeLessThanOrEqual(1)
  })

  it('£150,000 at 5.5% over 300 months ≈ £921.13/mo (±1p)', () => {
    const p = annuityMonthlyPaymentPence({
      principalPence: 150_000_00n,
      annualRateBps: 550,
      termMonths: 300,
    })
    expect(Number(p - 921_13n)).toBeLessThanOrEqual(1)
    expect(Number(921_13n - p)).toBeLessThanOrEqual(1)
  })

  it('zero rate falls back to straight-line principal: £120k / 240 = £500', () => {
    expect(
      annuityMonthlyPaymentPence({
        principalPence: 120_000_00n,
        annualRateBps: 0,
        termMonths: 240,
      }),
    ).toBe(500_00n)
  })

  it('rejects negative principal and non-positive term', () => {
    expect(() =>
      annuityMonthlyPaymentPence({ principalPence: -1n, annualRateBps: 500, termMonths: 300 }),
    ).toThrow(RangeError)
    expect(() =>
      annuityMonthlyPaymentPence({ principalPence: 1_000_00n, annualRateBps: 500, termMonths: 0 }),
    ).toThrow(RangeError)
  })
})

describe('refinanceScenario', () => {
  const base = {
    currentBalancePence: 150_000_00n,
    currentRateBps: 560, // 5.6%
    currentMonthlyPaymentPence: 700_00n,
    currentIsInterestOnly: true,
    candidateRateBps: 450,
    candidateTermMonths: 300,
    candidateIsInterestOnly: true,
    arrangementFeePence: 0n,
    addFeeToLoan: false,
    ercPence: 0n,
    monthlyRentPence: 1_200_00n,
  }

  it('interest-only candidate: payment = balance × rate ÷ 12', () => {
    const r = refinanceScenario(base)
    // 15,000,000p × 450 / 120,000 = 56,250p = £562.50
    expect(r.newLoanPence).toBe(150_000_00n)
    expect(r.newMonthlyPaymentPence).toBe(562_50n)
    expect(r.monthlyDeltaPence).toBe(-137_50n) // saving £137.50/mo
  })

  it('repayment candidate uses the annuity formula', () => {
    const r = refinanceScenario({ ...base, candidateIsInterestOnly: false })
    const expected = annuityMonthlyPaymentPence({
      principalPence: 150_000_00n,
      annualRateBps: 450,
      termMonths: 300,
    })
    expect(r.newMonthlyPaymentPence).toBe(expected)
  })

  it('break-even = ceil(upfront ÷ saving): £2,999 ÷ £137.50 → 22 months', () => {
    const r = refinanceScenario({ ...base, arrangementFeePence: 999_00n, ercPence: 2_000_00n })
    expect(r.breakEvenMonths).toBe(22)
  })

  it('break-even is 0 when there is saving but no upfront cost', () => {
    expect(refinanceScenario(base).breakEvenMonths).toBe(0)
  })

  it('break-even is null when the payment rises', () => {
    const r = refinanceScenario({ ...base, candidateRateBps: 650, ercPence: 1_000_00n })
    expect(r.monthlyDeltaPence > 0n).toBe(true)
    expect(r.breakEvenMonths).toBeNull()
  })

  it('fee added to loan grows the loan and drops out of upfront cost', () => {
    const r = refinanceScenario({
      ...base,
      arrangementFeePence: 999_00n,
      addFeeToLoan: true,
      ercPence: 2_000_00n,
    })
    expect(r.newLoanPence).toBe(150_999_00n)
    // Payment reflects the bigger loan: 15,099,900p × 450 / 120,000 = 56,624p
    expect(r.newMonthlyPaymentPence).toBe(566_24n)
    // Upfront = ERC only → 200,000 / (70,000 − 56,624) = 14.95 → 15 months
    expect(r.breakEvenMonths).toBe(15)
  })

  it('ICR passes at the pay rate and under stress with healthy rent', () => {
    const r = refinanceScenario(base)
    // Pay-rate ICR: 120,000 × 10,000 / 56,250 = 21,333 bps (213%)
    expect(r.icrBps).toBe(21_333)
    expect(r.icrPasses).toBe(true)
    // Stress = max(450 + 200, 550) = 650 → interest 81,250p → 14,769 bps
    expect(r.stressBps).toBe(650)
    expect(r.stressedIcrBps).toBe(14_769)
    expect(r.stressedIcrPasses).toBe(true)
  })

  it('ICR fails when rent is thin', () => {
    const r = refinanceScenario({ ...base, monthlyRentPence: 600_00n })
    // 60,000 × 10,000 / 56,250 = 10,666 bps < 12,500
    expect(r.icrBps).toBe(10_666)
    expect(r.icrBps).toBeLessThan(ICR_THRESHOLD_BPS)
    expect(r.icrPasses).toBe(false)
    expect(r.stressedIcrPasses).toBe(false)
  })

  it('stress rate has the 5.50% PRA floor (matches icr.ts convention)', () => {
    const r = refinanceScenario({ ...base, candidateRateBps: 300 })
    expect(r.stressBps).toBe(550) // not 500
  })

  it('derives the current payment from balance × rate when stored payment is 0 and IO', () => {
    const r = refinanceScenario({ ...base, currentMonthlyPaymentPence: 0n })
    // Derived current: 15,000,000p × 560 / 120,000 = 70,000p.
    // Delta = 56,250 − 70,000 = −13,750p (£137.50/mo saving).
    expect(r.monthlyDeltaPence).toBe(-137_50n)
  })

  it('icrBps is null at a zero candidate rate (no interest to cover)', () => {
    const r = refinanceScenario({ ...base, candidateRateBps: 0 })
    expect(r.icrBps).toBeNull()
    expect(r.icrPasses).toBe(false)
  })
})
