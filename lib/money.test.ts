import { describe, it, expect } from 'vitest'
import {
  toGbp,
  formatGbp,
  formatGbpPrecise,
  bpsToPercent,
  percentToBps,
  multiplyByBps,
} from './money'

describe('toGbp', () => {
  it('converts pence to GBP as a number', () => {
    expect(toGbp(0n)).toBe(0)
    expect(toGbp(100n)).toBe(1)
    expect(toGbp(123_45n)).toBe(123.45)
  })

  it('handles negative values', () => {
    expect(toGbp(-50n)).toBe(-0.5)
  })

  it('handles large values without precision loss within Number.MAX_SAFE_INTEGER', () => {
    // £90 trillion ≈ 9e15 pence, just under 2^53.
    expect(toGbp(9_000_000_000_000_000n)).toBe(90_000_000_000_000)
  })
})

describe('formatGbp', () => {
  it('renders whole pounds without decimals', () => {
    expect(formatGbp(120_000n)).toBe('£1,200')
    expect(formatGbp(0n)).toBe('£0')
  })

  it('rounds to nearest pound', () => {
    expect(formatGbp(120_050n)).toMatch(/£1,200|£1,201/) // bankers' rounding tolerance
  })

  it('shows the fallback em-dash for null / undefined', () => {
    expect(formatGbp(null)).toBe('—')
    expect(formatGbp(undefined)).toBe('—')
  })

  it('renders negative values with a minus sign', () => {
    expect(formatGbp(-100_00n)).toContain('-')
  })
})

describe('formatGbpPrecise', () => {
  it('preserves pence', () => {
    expect(formatGbpPrecise(123_45n)).toBe('£123.45')
    expect(formatGbpPrecise(99n)).toBe('£0.99')
  })

  it('falls back on null / undefined', () => {
    expect(formatGbpPrecise(null)).toBe('—')
    expect(formatGbpPrecise(undefined)).toBe('—')
  })
})

describe('bpsToPercent', () => {
  it('renders 100bps as 1.00%', () => {
    expect(bpsToPercent(100)).toBe('1.00%')
  })

  it('renders 525bps (typical mortgage rate) as 5.25%', () => {
    expect(bpsToPercent(525)).toBe('5.25%')
  })

  it('handles zero', () => {
    expect(bpsToPercent(0)).toBe('0.00%')
  })
})

describe('percentToBps', () => {
  it('round-trips with bpsToPercent', () => {
    expect(percentToBps(5.25)).toBe(525)
    expect(percentToBps(0)).toBe(0)
    expect(percentToBps(12.5)).toBe(1250)
  })

  it('rounds sub-bps fractional input', () => {
    expect(percentToBps(5.251)).toBe(525) // truncates the .1bps
    expect(percentToBps(5.256)).toBe(526) // rounds up
  })
})

describe('multiplyByBps', () => {
  it('5% of £100,000 = £5,000', () => {
    expect(multiplyByBps(10_000_000n, 500)).toBe(500_000n)
  })

  it('0% returns 0', () => {
    expect(multiplyByBps(10_000_000n, 0)).toBe(0n)
  })

  it('100% (10000bps) returns the value unchanged', () => {
    expect(multiplyByBps(123_456n, 10_000)).toBe(123_456n)
  })

  it('rounds toward zero (integer bigint division)', () => {
    // (1n * 1bps) / 10000n = 0 (not 0.0001)
    expect(multiplyByBps(1n, 1)).toBe(0n)
    // (9999n * 1bps) / 10000n = 0
    expect(multiplyByBps(9_999n, 1)).toBe(0n)
    // (10000n * 1bps) / 10000n = 1
    expect(multiplyByBps(10_000n, 1)).toBe(1n)
  })

  it('handles negative values (e.g. interest on a credit balance)', () => {
    expect(multiplyByBps(-10_000_000n, 525)).toBe(-525_000n)
  })

  it('handles large values without overflow (bigint native)', () => {
    // £1 billion at 5.25% = £52.5m
    expect(multiplyByBps(100_000_000_000n, 525)).toBe(5_250_000_000n)
  })
})
