import { describe, it, expect } from 'vitest'
import { propertyKpis } from './property-kpis'

describe('propertyKpis', () => {
  it('uses purchase price as value when no valuation set', () => {
    const k = propertyKpis({
      purchasePricePence: 25_000_000n,
      currentValuationPence: null,
      acquisitionCostsPence: null,
      refurbCostPence: null,
      sdltPaidPence: null,
      mortgageBalancePence: null,
      weeklyRentRollPence: null,
    })
    expect(k.valuePence).toBe(25_000_000n)
    expect(k.equityPence).toBe(25_000_000n)
    expect(k.ltvBps).toBeNull() // never valued
  })

  it('computes equity, LTV, and yield when fully populated', () => {
    const k = propertyKpis({
      purchasePricePence: 25_000_000n, // £250k
      currentValuationPence: 32_500_000n, // £325k
      acquisitionCostsPence: 200_000n, // £2k
      refurbCostPence: 5_000_000n, // £50k
      sdltPaidPence: 750_000n, // £7.5k
      mortgageBalancePence: 20_000_000n, // £200k
      weeklyRentRollPence: 65_000n, // £650/week
    })
    expect(k.valuePence).toBe(32_500_000n)
    expect(k.equityPence).toBe(12_500_000n) // £125k
    // 200000 / 325000 = 0.6153... → 6153 bps (61.53%)
    expect(k.ltvBps).toBe(6153)
    // 650 * 52 / 325000 = 0.104 → 1040 bps (10.40%)
    expect(k.grossYieldBps).toBe(1040)
    // 250 + 7.5 + 50 + 2 = £309.5k
    expect(k.allInCostPence).toBe(30_950_000n)
  })

  it('returns negative equity if debt exceeds value', () => {
    const k = propertyKpis({
      purchasePricePence: 25_000_000n,
      currentValuationPence: 22_000_000n,
      acquisitionCostsPence: null,
      refurbCostPence: null,
      sdltPaidPence: null,
      mortgageBalancePence: 25_000_000n,
      weeklyRentRollPence: null,
    })
    expect(k.equityPence).toBe(-3_000_000n)
    expect(k.ltvBps).toBeGreaterThan(10_000) // > 100%
  })

  it('reports LTV 0 when valuation exists but no debt', () => {
    const k = propertyKpis({
      purchasePricePence: 25_000_000n,
      currentValuationPence: 30_000_000n,
      acquisitionCostsPence: null,
      refurbCostPence: null,
      sdltPaidPence: null,
      mortgageBalancePence: null,
      weeklyRentRollPence: null,
    })
    expect(k.ltvBps).toBe(0)
  })

  it('skips yield when rent roll is zero', () => {
    const k = propertyKpis({
      purchasePricePence: 25_000_000n,
      currentValuationPence: 30_000_000n,
      acquisitionCostsPence: null,
      refurbCostPence: null,
      sdltPaidPence: null,
      mortgageBalancePence: null,
      weeklyRentRollPence: 0n,
    })
    expect(k.grossYieldBps).toBeNull()
  })
})
