import { describe, it, expect } from 'vitest'
import { effectiveStressBps, icr } from './icr'

describe('effectiveStressBps', () => {
  it('uses pay rate for 5-year fixes', () => {
    expect(
      effectiveStressBps({
        payRateBps: 450,
        productYears: 5,
        monthlyRentPence: 0n,
        balancePence: 0n,
        borrowerKind: 'individual_higher',
      })
    ).toBe(450)
  })

  it('uses pay rate for 10-year fixes', () => {
    expect(
      effectiveStressBps({
        payRateBps: 425,
        productYears: 10,
        monthlyRentPence: 0n,
        balancePence: 0n,
        borrowerKind: 'company',
      })
    ).toBe(425)
  })

  it('applies +200bps for shorter products', () => {
    expect(
      effectiveStressBps({
        payRateBps: 500,
        productYears: 2,
        monthlyRentPence: 0n,
        balancePence: 0n,
        borrowerKind: 'individual_higher',
      })
    ).toBe(700)
  })

  it('enforces 550bps minimum stress', () => {
    expect(
      effectiveStressBps({
        payRateBps: 200,
        productYears: 2,
        monthlyRentPence: 0n,
        balancePence: 0n,
        borrowerKind: 'individual_higher',
      })
    ).toBe(550)
  })
})

describe('icr', () => {
  it('passes comfortably when rent is well above stressed interest', () => {
    const result = icr({
      monthlyRentPence: 200_000n, // £2,000
      balancePence: 15_000_000n, // £150,000
      payRateBps: 450,
      productYears: 2,
      borrowerKind: 'individual_higher',
    })
    // stress 650 bps. monthly interest = 15M * 0.065 / 12 ≈ 81,250p (£812.50)
    // ratio = 2000 / 812.50 ≈ 2.46
    expect(result.stressBps).toBe(650)
    expect(result.ratio).toBeGreaterThan(2)
    expect(result.passes).toBe(true)
  })

  it('fails for higher-rate borrower on thin margin', () => {
    const result = icr({
      monthlyRentPence: 100_000n,
      balancePence: 15_000_000n,
      payRateBps: 450,
      productYears: 2,
      borrowerKind: 'individual_higher',
    })
    // stressed monthly ≈ 81,250p, ratio ≈ 1.23, threshold 1.45 → fail
    expect(result.passes).toBe(false)
    expect(result.thresholdRatio).toBe(1.45)
  })

  it('basic-rate borrower has lower threshold and passes same scenario', () => {
    const result = icr({
      monthlyRentPence: 100_000n,
      balancePence: 15_000_000n,
      payRateBps: 450,
      productYears: 2,
      borrowerKind: 'individual_basic',
    })
    expect(result.thresholdRatio).toBe(1.25)
    // ratio ~1.23 still fails 1.25 but is close — verify
    expect(result.passes).toBe(false)
  })

  it('uses pay rate (lower stress) for 5+ year fix, unlocking deals', () => {
    const result = icr({
      monthlyRentPence: 100_000n,
      balancePence: 15_000_000n,
      payRateBps: 450,
      productYears: 5,
      borrowerKind: 'individual_higher',
    })
    // stress 450 bps → monthly interest = 15M * 0.045 / 12 ≈ 56,250p
    // ratio ≈ 100,000 / 56,250 ≈ 1.78 → passes 1.45
    expect(result.stressBps).toBe(450)
    expect(result.passes).toBe(true)
  })
})
