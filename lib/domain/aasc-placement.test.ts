import { describe, it, expect } from 'vitest'
import {
  placementGrossPerWeekPence,
  placementNetPerWeekPence,
  propertyAascRevenueAnnualPence,
} from './aasc-placement'
import { clearspringsMaxWeeklyPence } from './aasc'

describe('placementGrossPerWeekPence', () => {
  it('rate × service users', () => {
    expect(
      placementGrossPerWeekPence({ weeklyRatePence: 15_000n, serviceUserCount: 3 }),
    ).toBe(45_000n)
  })
  it('zero count returns 0', () => {
    expect(
      placementGrossPerWeekPence({ weeklyRatePence: 15_000n, serviceUserCount: 0 }),
    ).toBe(0n)
  })
})

describe('placementNetPerWeekPence', () => {
  it('applies the placement override when set', () => {
    // 1 SU × £150/week × (10000-2000)/10000 = £120/week
    expect(
      placementNetPerWeekPence({
        weeklyRatePence: 15_000n,
        serviceUserCount: 1,
        commissionRateBpsOverride: 2000,
        contractCommissionRateBps: 1000,
      }),
    ).toBe(12_000n)
  })
  it('falls back to contract commission when override null', () => {
    // 1 SU × £150 × (10000-1000)/10000 = £135/week
    expect(
      placementNetPerWeekPence({
        weeklyRatePence: 15_000n,
        serviceUserCount: 1,
        commissionRateBpsOverride: null,
        contractCommissionRateBps: 1000,
      }),
    ).toBe(13_500n)
  })
  it('0% commission = gross', () => {
    expect(
      placementNetPerWeekPence({
        weeklyRatePence: 15_000n,
        serviceUserCount: 2,
        commissionRateBpsOverride: 0,
        contractCommissionRateBps: 0,
      }),
    ).toBe(30_000n)
  })
})

describe('propertyAascRevenueAnnualPence', () => {
  const today = new Date('2026-05-15')

  it('sums active placements × 52', () => {
    const annual = propertyAascRevenueAnnualPence({
      placements: [
        {
          weeklyRatePence: 15_000n,
          serviceUserCount: 1,
          commissionRateBpsOverride: null,
          endDateActual: null,
        },
        {
          weeklyRatePence: 20_000n,
          serviceUserCount: 2,
          commissionRateBpsOverride: null,
          endDateActual: null,
        },
      ],
      contractCommissionRateBps: 0,
      asOf: today,
    })
    // £150 + (£200 × 2) = £550/wk × 52 = £28,600
    expect(annual).toBe(2_860_000n)
  })

  it('excludes placements ended before asOf', () => {
    const annual = propertyAascRevenueAnnualPence({
      placements: [
        {
          weeklyRatePence: 15_000n,
          serviceUserCount: 1,
          commissionRateBpsOverride: null,
          endDateActual: '2026-01-01',
        },
      ],
      contractCommissionRateBps: 0,
      asOf: today,
    })
    expect(annual).toBe(0n)
  })

  it('includes placements with future end dates', () => {
    const annual = propertyAascRevenueAnnualPence({
      placements: [
        {
          weeklyRatePence: 15_000n,
          serviceUserCount: 1,
          commissionRateBpsOverride: null,
          endDateActual: '2027-01-01',
        },
      ],
      contractCommissionRateBps: 0,
      asOf: today,
    })
    expect(annual).toBe(780_000n)
  })
})

describe('clearspringsMaxWeeklyPence (worked example from aasc.md)', () => {
  it('SAR £85/wk → ceiling £119/wk (×1.40)', () => {
    // £85/wk = 8500p; × 14000/10000 = 11900p = £119
    expect(clearspringsMaxWeeklyPence(8500n)).toBe(11_900n)
  })
})
