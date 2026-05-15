import { describe, it, expect } from 'vitest'
import { weightedAverageLtvBps, portfolioTotals } from './portfolio'

describe('weightedAverageLtvBps', () => {
  it('returns null when total value is zero', () => {
    expect(weightedAverageLtvBps([])).toBeNull()
    expect(
      weightedAverageLtvBps([
        { valuePence: 0n, debtPence: 0n },
        { valuePence: 0n, debtPence: 0n },
      ]),
    ).toBeNull()
  })

  it('returns 0 for unlevered portfolio', () => {
    expect(
      weightedAverageLtvBps([
        { valuePence: 30_000_000n, debtPence: 0n },
        { valuePence: 40_000_000n, debtPence: 0n },
      ]),
    ).toBe(0)
  })

  it('weights by value (not by count)', () => {
    // P1: £300k value, £200k debt → 66.67% LTV
    // P2: £900k value, £450k debt → 50% LTV
    // Average by count = 58.34%
    // Weighted by value = 650k / 1200k = 54.17% → 5416 bps
    const result = weightedAverageLtvBps([
      { valuePence: 30_000_000n, debtPence: 20_000_000n },
      { valuePence: 90_000_000n, debtPence: 45_000_000n },
    ])
    expect(result).toBe(5416)
  })

  it('handles single property', () => {
    // £325k value, £200k debt → 200000 / 325000 = 61.538% → 6153 bps
    expect(
      weightedAverageLtvBps([
        { valuePence: 32_500_000n, debtPence: 20_000_000n },
      ]),
    ).toBe(6153)
  })
})

describe('portfolioTotals', () => {
  it('sums value, debt, equity', () => {
    const result = portfolioTotals([
      { valuePence: 30_000_000n, debtPence: 20_000_000n },
      { valuePence: 90_000_000n, debtPence: 45_000_000n },
    ])
    expect(result.totalValuePence).toBe(120_000_000n)
    expect(result.totalDebtPence).toBe(65_000_000n)
    expect(result.totalEquityPence).toBe(55_000_000n)
  })

  it('handles empty portfolio', () => {
    const result = portfolioTotals([])
    expect(result.totalValuePence).toBe(0n)
    expect(result.totalDebtPence).toBe(0n)
    expect(result.totalEquityPence).toBe(0n)
  })
})
