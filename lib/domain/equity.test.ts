import { describe, it, expect } from 'vitest'
import { equity, ltvBps, stressedLtvBps } from './equity'

describe('equity', () => {
  it('returns valuation minus balance', () => {
    expect(equity({ valuationPence: 30_000_000n, balancePence: 18_000_000n })).toBe(
      12_000_000n
    )
  })

  it('returns negative when over-leveraged', () => {
    expect(equity({ valuationPence: 10_000_000n, balancePence: 12_000_000n })).toBe(
      -2_000_000n
    )
  })

  it('handles zero balance', () => {
    expect(equity({ valuationPence: 30_000_000n, balancePence: 0n })).toBe(30_000_000n)
  })
})

describe('ltvBps', () => {
  it('computes 75% as 7500 bps', () => {
    expect(ltvBps({ valuationPence: 40_000_000n, balancePence: 30_000_000n })).toBe(7500)
  })

  it('returns 0 for zero valuation (safe divide)', () => {
    expect(ltvBps({ valuationPence: 0n, balancePence: 5_000_000n })).toBe(0)
  })

  it('handles over-100% LTV', () => {
    expect(ltvBps({ valuationPence: 10_000_000n, balancePence: 11_000_000n })).toBe(11000)
  })
})

describe('stressedLtvBps', () => {
  it('shows ~83% LTV under 10% value stress for an 75% LTV loan', () => {
    const result = stressedLtvBps({
      valuationPence: 40_000_000n,
      balancePence: 30_000_000n,
      stressBps: 1000,
    })
    // valuation drops to 36M, balance still 30M → ~8333 bps
    expect(result).toBeGreaterThanOrEqual(8333)
    expect(result).toBeLessThanOrEqual(8334)
  })
})
