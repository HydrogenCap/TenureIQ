import { describe, it, expect } from 'vitest'
import {
  individualLandlordTax,
  companyLandlordTax,
  section24CostPence,
} from './section24'

// Worked example: a typical higher-rate landlord with £24k rent, £10k
// mortgage interest, £4k other costs. Pre-S24 tax would be 40% on
// (24k - 10k - 4k) = £4,000. Post-S24, taxable profit is (24k - 4k) =
// £20k → 40% = £8,000, minus 20% interest credit on £10k = £2,000 →
// net tax £6,000. Section 24 cost = £2,000.
describe('individualLandlordTax — higher-rate (4000bps)', () => {
  const input = {
    grossRentPence: 24_000_00n,
    mortgageInterestPence: 10_000_00n,
    otherCostsPence: 4_000_00n,
    marginalRateBps: 4000,
  }

  it('computes taxable profit excluding mortgage interest', () => {
    const r = individualLandlordTax(input)
    expect(r.taxableProfitPence).toBe(20_000_00n)
  })

  it('applies the 20% interest credit', () => {
    const r = individualLandlordTax(input)
    expect(r.interestCreditPence).toBe(2_000_00n)
  })

  it('nets the tax correctly', () => {
    const r = individualLandlordTax(input)
    expect(r.netTaxPence).toBe(6_000_00n)
  })

  it('reports the effective rate on rent in bps', () => {
    const r = individualLandlordTax(input)
    // 6000 / 24000 = 25%
    expect(r.effectiveRateOnRentBps).toBe(2500)
  })
})

describe('individualLandlordTax — basic rate', () => {
  it('produces the same outcome as pre-S24 (interest still benefits)', () => {
    const r = individualLandlordTax({
      grossRentPence: 24_000_00n,
      mortgageInterestPence: 10_000_00n,
      otherCostsPence: 4_000_00n,
      marginalRateBps: 2000,
    })
    // Taxable profit 20k @ 20% = 4k, minus 20% interest credit on 10k = 2k → 2k.
    expect(r.netTaxPence).toBe(2_000_00n)
  })
})

describe('individualLandlordTax — edge cases', () => {
  it('floors net tax at zero when the credit exceeds tax before credit', () => {
    const r = individualLandlordTax({
      grossRentPence: 5_000_00n,
      mortgageInterestPence: 20_000_00n, // heavy interest
      otherCostsPence: 1_000_00n,
      marginalRateBps: 4000,
    })
    // Profit = 4000, tax before credit = 1600, credit = 4000 → raw -2400 → floor 0.
    expect(r.netTaxPence).toBe(0n)
  })

  it('handles a loss-making year (negative profit → 0 tax before credit)', () => {
    const r = individualLandlordTax({
      grossRentPence: 5_000_00n,
      mortgageInterestPence: 10_000_00n,
      otherCostsPence: 8_000_00n,
      marginalRateBps: 4000,
    })
    expect(r.taxableProfitPence).toBe(-3_000_00n)
    expect(r.taxBeforeCreditPence).toBe(0n)
    expect(r.netTaxPence).toBe(0n)
  })

  it('returns effectiveRateOnRentBps = 0 when grossRentPence is 0', () => {
    const r = individualLandlordTax({
      grossRentPence: 0n,
      mortgageInterestPence: 0n,
      otherCostsPence: 0n,
      marginalRateBps: 4000,
    })
    expect(r.effectiveRateOnRentBps).toBe(0)
  })
})

describe('companyLandlordTax', () => {
  it('main rate 25% on profits after fully-deducted interest', () => {
    const r = companyLandlordTax({
      grossRentPence: 24_000_00n,
      mortgageInterestPence: 10_000_00n,
      otherCostsPence: 4_000_00n,
      ctRateBps: 2500,
    })
    // Profit = 10k, tax = 2500.
    expect(r.taxableProfitPence).toBe(10_000_00n)
    expect(r.netTaxPence).toBe(2_500_00n)
  })

  it('small-profits rate 19%', () => {
    const r = companyLandlordTax({
      grossRentPence: 24_000_00n,
      mortgageInterestPence: 10_000_00n,
      otherCostsPence: 4_000_00n,
      ctRateBps: 1900,
    })
    expect(r.netTaxPence).toBe(1_900_00n)
  })

  it('returns 0 tax on a loss', () => {
    const r = companyLandlordTax({
      grossRentPence: 5_000_00n,
      mortgageInterestPence: 10_000_00n,
      otherCostsPence: 0n,
      ctRateBps: 2500,
    })
    expect(r.taxableProfitPence).toBe(-5_000_00n)
    expect(r.netTaxPence).toBe(0n)
  })
})

describe('section24CostPence', () => {
  it('returns 0 for basic-rate taxpayers (no S24 hit)', () => {
    expect(
      section24CostPence({
        grossRentPence: 24_000_00n,
        mortgageInterestPence: 10_000_00n,
        otherCostsPence: 4_000_00n,
        marginalRateBps: 2000,
      }),
    ).toBe(0n)
  })

  it('higher-rate: extra £2k tax on £10k interest (40% - 20%)', () => {
    // Pre-S24: profit 10k * 40% = 4k.
    // Post-S24: 6k net (worked above).
    // Diff = 2k.
    expect(
      section24CostPence({
        grossRentPence: 24_000_00n,
        mortgageInterestPence: 10_000_00n,
        otherCostsPence: 4_000_00n,
        marginalRateBps: 4000,
      }),
    ).toBe(2_000_00n)
  })

  it('additional-rate: 45% marginal → 25% S24 hit on the interest', () => {
    // 25% of £10k = £2,500.
    expect(
      section24CostPence({
        grossRentPence: 24_000_00n,
        mortgageInterestPence: 10_000_00n,
        otherCostsPence: 4_000_00n,
        marginalRateBps: 4500,
      }),
    ).toBe(2_500_00n)
  })
})
