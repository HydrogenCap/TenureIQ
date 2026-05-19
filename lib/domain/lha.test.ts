import { describe, it, expect } from 'vitest'
import { lhaRate, weeklyToMonthlyPence } from './lha'

const RATES = [
  {
    brmaCode: 'BRMA-001',
    beds: 'SAR' as const,
    weeklyPence: 9_000n,
    effectiveFrom: '2025-04-01',
    effectiveTo: '2026-03-31',
  },
  {
    brmaCode: 'BRMA-001',
    beds: 'SAR' as const,
    weeklyPence: 10_000n,
    effectiveFrom: '2026-04-01',
    effectiveTo: null,
  },
  {
    brmaCode: 'BRMA-001',
    beds: '2B' as const,
    weeklyPence: 22_500n,
    effectiveFrom: '2026-04-01',
    effectiveTo: null,
  },
  {
    brmaCode: 'BRMA-002',
    beds: 'SAR' as const,
    weeklyPence: 12_500n,
    effectiveFrom: '2026-04-01',
    effectiveTo: null,
  },
]

describe('lhaRate', () => {
  it('picks the row whose effectiveFrom <= asOf < effectiveTo', () => {
    const r = lhaRate(RATES, 'BRMA-001', 'SAR', new Date('2026-01-15'))
    expect(r).not.toBeNull()
    expect(r!.weeklyPence).toBe(9_000n) // pre-uprate
  })

  it('picks the row with effectiveTo === null when asOf is in the future', () => {
    const r = lhaRate(RATES, 'BRMA-001', 'SAR', new Date('2026-06-15'))
    expect(r!.weeklyPence).toBe(10_000n) // post-uprate
  })

  it('returns null when no row matches the brma+beds combination', () => {
    expect(lhaRate(RATES, 'BRMA-999', 'SAR', new Date('2026-01-15'))).toBeNull()
    expect(lhaRate(RATES, 'BRMA-001', '3B', new Date('2026-01-15'))).toBeNull()
  })

  it('returns null when the date falls before any effectiveFrom', () => {
    expect(lhaRate(RATES, 'BRMA-001', 'SAR', new Date('2024-01-01'))).toBeNull()
  })

  it('isolates rates by brmaCode', () => {
    const r = lhaRate(RATES, 'BRMA-002', 'SAR', new Date('2026-06-15'))
    expect(r!.weeklyPence).toBe(12_500n)
  })
})

describe('weeklyToMonthlyPence', () => {
  it('applies the housing-benefit × 52 ÷ 12 conversion', () => {
    // £100/wk × 52 / 12 = £433.33/mo → 43333 pence (integer floor).
    expect(weeklyToMonthlyPence(10_000n)).toBe(43_333n)
  })

  it('returns 0 for 0 weekly', () => {
    expect(weeklyToMonthlyPence(0n)).toBe(0n)
  })

  it('does not use the wrong "× 4" approximation', () => {
    // A £150/wk rate isn't £600/month — it's £650.
    expect(weeklyToMonthlyPence(15_000n)).toBe(65_000n)
    expect(weeklyToMonthlyPence(15_000n)).not.toBe(60_000n)
  })
})
