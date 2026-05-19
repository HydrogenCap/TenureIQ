import { describe, it, expect } from 'vitest'
import {
  CLEARSPRINGS_UPLIFT_BPS,
  clearspringsMaxWeeklyPence,
  clearspringsMaxMonthlyPence,
  sercoAreaStatus,
  clearspringsDemandGap,
  projectedClearspringsMonthlyIncomePence,
} from './aasc'

describe('CLEARSPRINGS_UPLIFT_BPS — domain constant', () => {
  it('is the documented SAR + 40% uplift', () => {
    // Hard rule from CLAUDE.md: Clearsprings does NOT pay at or below
    // LHA SAR — they pay SAR + 40%. Pinning the constant guards
    // against an accidental edit.
    expect(CLEARSPRINGS_UPLIFT_BPS).toBe(4000)
  })
})

describe('clearspringsMaxWeeklyPence', () => {
  it('£100/wk SAR → £140/wk Clearsprings ceiling', () => {
    expect(clearspringsMaxWeeklyPence(10_000n)).toBe(14_000n)
  })

  it('0 SAR → 0', () => {
    expect(clearspringsMaxWeeklyPence(0n)).toBe(0n)
  })
})

describe('clearspringsMaxMonthlyPence', () => {
  it('applies the × 52 ÷ 12 conversion on the uplifted weekly', () => {
    // £100/wk SAR → £140/wk → × 52 ÷ 12 = £606.67 → 60666 pence
    expect(clearspringsMaxMonthlyPence(10_000n)).toBe(60_666n)
  })
})

describe('sercoAreaStatus', () => {
  const areas = [
    { localAuthority: 'Birmingham', status: 'open' as const },
    { localAuthority: 'Leeds', status: 'limited' as const },
    { localAuthority: 'Stoke-on-Trent', status: 'closed' as const },
  ]

  it('returns the recorded status for a known LA', () => {
    expect(sercoAreaStatus(areas, 'Birmingham')).toBe('open')
    expect(sercoAreaStatus(areas, 'Leeds')).toBe('limited')
    expect(sercoAreaStatus(areas, 'Stoke-on-Trent')).toBe('closed')
  })

  it('is case-insensitive on the local authority name', () => {
    expect(sercoAreaStatus(areas, 'birmingham')).toBe('open')
    expect(sercoAreaStatus(areas, 'STOKE-ON-TRENT')).toBe('closed')
  })

  it('returns "unknown" for an LA not in the dataset', () => {
    expect(sercoAreaStatus(areas, 'Cardiff')).toBe('unknown')
  })

  it('returns "unknown" on an empty dataset', () => {
    expect(sercoAreaStatus([], 'Birmingham')).toBe('unknown')
  })
})

describe('clearspringsDemandGap', () => {
  const areas = [
    { localAuthority: 'Manchester', demandPending: 12 },
    { localAuthority: 'Liverpool', demandPending: -5 }, // oversupply
  ]

  it('returns the pending demand for a matched LA', () => {
    expect(clearspringsDemandGap(areas, 'Manchester')).toBe(12)
  })

  it('returns a negative value for oversupplied areas', () => {
    expect(clearspringsDemandGap(areas, 'Liverpool')).toBe(-5)
  })

  it('returns null for an unknown LA (not 0 — that would be misleading)', () => {
    expect(clearspringsDemandGap(areas, 'Anywhere')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(clearspringsDemandGap(areas, 'manchester')).toBe(12)
  })
})

describe('projectedClearspringsMonthlyIncomePence', () => {
  it('full-occupancy 4-bed at £100/wk SAR', () => {
    // perBedMonthly = 60_666; 4 beds @ 100% = 242,664 pence
    expect(
      projectedClearspringsMonthlyIncomePence({
        sarWeeklyPence: 10_000n,
        bedCount: 4,
        occupancy: 1,
      }),
    ).toBe(242_664n)
  })

  it('95% occupancy reduces the income', () => {
    // 4 * 60_666 * 0.95 = 230,530.8 → 230,530 (integer floor).
    expect(
      projectedClearspringsMonthlyIncomePence({
        sarWeeklyPence: 10_000n,
        bedCount: 4,
        occupancy: 0.95,
      }),
    ).toBe(230_530n)
  })

  it('zero beds returns zero income', () => {
    expect(
      projectedClearspringsMonthlyIncomePence({
        sarWeeklyPence: 10_000n,
        bedCount: 0,
        occupancy: 1,
      }),
    ).toBe(0n)
  })
})
