import { describe, it, expect } from 'vitest'
import { grossYieldBps, netYieldBps, roiOnCashInBps } from './yield'

describe('grossYieldBps', () => {
  it('£12k rent on £200k value = 6.00%', () => {
    expect(grossYieldBps(12_000_00n, 200_000_00n)).toBe(600)
  })

  it('£20k rent on £200k value = 10.00%', () => {
    expect(grossYieldBps(20_000_00n, 200_000_00n)).toBe(1000)
  })

  it('returns 0 when valuation is 0 (avoids divide-by-zero)', () => {
    expect(grossYieldBps(10_000_00n, 0n)).toBe(0)
  })

  it('handles fractional bps via integer floor', () => {
    // 100/333 ≈ 0.30030... → 30bps when * 10000
    expect(grossYieldBps(100n, 333n)).toBe(3003)
  })
})

describe('netYieldBps', () => {
  it('(£12k - £3k costs) on £200k value = 4.50%', () => {
    expect(netYieldBps(12_000_00n, 3_000_00n, 200_000_00n)).toBe(450)
  })

  it('can be negative when costs exceed rent', () => {
    expect(netYieldBps(5_000_00n, 8_000_00n, 200_000_00n)).toBe(-150)
  })

  it('returns 0 on zero valuation', () => {
    expect(netYieldBps(12_000_00n, 3_000_00n, 0n)).toBe(0)
  })
})

describe('roiOnCashInBps', () => {
  it('£6k profit on £100k cash = 6.00%', () => {
    expect(roiOnCashInBps(6_000_00n, 100_000_00n)).toBe(600)
  })

  it('returns 0 when cashInvested is 0', () => {
    expect(roiOnCashInBps(6_000_00n, 0n)).toBe(0)
  })

  it('can be negative on a loss', () => {
    expect(roiOnCashInBps(-1_000_00n, 100_000_00n)).toBe(-100)
  })
})
