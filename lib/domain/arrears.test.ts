import { describe, it, expect } from 'vitest'
import {
  monthKey,
  lastNMonthKeys,
  firstChargeableMonth,
  expectedMonthlyRentPence,
  expectedForMonth,
  expectedByMonth,
  arrearsForProperty,
  type ArrearsTenancy,
} from './arrears'

const MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']

describe('monthKey / lastNMonthKeys', () => {
  it('formats UTC months with zero padding', () => {
    expect(monthKey('2026-07-04')).toBe('2026-07')
    expect(monthKey(new Date(Date.UTC(2026, 0, 31)))).toBe('2026-01')
  })

  it('returns n keys oldest first, ending with the current month', () => {
    expect(lastNMonthKeys(6, '2026-07-04')).toEqual(MONTHS)
  })

  it('crosses year boundaries walking backwards', () => {
    expect(lastNMonthKeys(3, '2026-01-15')).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})

describe('firstChargeableMonth', () => {
  it('is the month after the month containing the start date', () => {
    expect(firstChargeableMonth('2026-04-15')).toBe('2026-05')
    // Even a 1st-of-month start skips its own month — we never model
    // the partial/first month's pro-rata.
    expect(firstChargeableMonth('2026-04-01')).toBe('2026-05')
  })

  it('rolls December into January of the next year', () => {
    expect(firstChargeableMonth('2025-12-20')).toBe('2026-01')
  })
})

describe('expectedMonthlyRentPence', () => {
  it('sums monthly equivalents across active tenancies only', () => {
    const tenancies: ArrearsTenancy[] = [
      { rentPence: 100_000n, rentPeriod: 'monthly', status: 'active', startDate: '2025-01-01' },
      // £120/wk → 120 × 52 / 12 = £520/mo
      { rentPence: 12_000n, rentPeriod: 'weekly', status: 'active', startDate: '2025-01-01' },
      { rentPence: 999_999n, rentPeriod: 'monthly', status: 'ended', startDate: '2024-01-01' },
    ]
    expect(expectedMonthlyRentPence(tenancies)).toBe(100_000n + 52_000n)
  })

  it('returns 0n for no tenancies', () => {
    expect(expectedMonthlyRentPence([])).toBe(0n)
  })
})

describe('expectedForMonth / expectedByMonth (mid-window start)', () => {
  const tenancies: ArrearsTenancy[] = [
    { rentPence: 80_000n, rentPeriod: 'monthly', status: 'active', startDate: '2025-01-01' },
    // Starts mid-window: first chargeable month is 2026-05.
    { rentPence: 60_000n, rentPeriod: 'monthly', status: 'active', startDate: '2026-04-20' },
  ]

  it('only counts a tenancy from the month after its start month', () => {
    expect(expectedForMonth(tenancies, '2026-04')).toBe(80_000n)
    expect(expectedForMonth(tenancies, '2026-05')).toBe(140_000n)
  })

  it('builds a per-month schedule over the window', () => {
    const schedule = expectedByMonth(tenancies, MONTHS)
    expect(schedule.get('2026-02')).toBe(80_000n)
    expect(schedule.get('2026-04')).toBe(80_000n)
    expect(schedule.get('2026-05')).toBe(140_000n)
    expect(schedule.get('2026-07')).toBe(140_000n)
  })
})

describe('arrearsForProperty', () => {
  const received = (byMonth: Record<string, bigint>) =>
    Object.entries(byMonth).map(([month, receivedPence]) => ({ month, receivedPence }))

  it('fully paid → zero balance and empty ageing buckets', () => {
    const result = arrearsForProperty({
      expectedMonthlyPence: 100_000n,
      receivedByMonth: received({
        '2026-02': 100_000n,
        '2026-03': 100_000n,
        '2026-04': 100_000n,
        '2026-05': 100_000n,
        '2026-06': 100_000n,
        '2026-07': 100_000n,
      }),
      months: MONTHS,
    })
    expect(result.balancePence).toBe(0n)
    expect(result.ageing).toEqual({ current: 0n, days30: 0n, days60: 0n, days90plus: 0n })
    expect(result.months).toHaveLength(6)
    expect(result.months.every((m) => m.shortfallPence === 0n)).toBe(true)
  })

  it('partial shortfall accumulates into the balance', () => {
    const result = arrearsForProperty({
      expectedMonthlyPence: 100_000n,
      receivedByMonth: received({
        '2026-06': 60_000n,
        '2026-07': 100_000n,
      }),
      months: ['2026-06', '2026-07'],
    })
    // June short by £400; July's exact payment clears June first (FIFO),
    // leaving July £400 outstanding — total £400 either way.
    expect(result.balancePence).toBe(40_000n)
    expect(result.months[0]?.shortfallPence).toBe(40_000n)
    expect(result.months[1]?.shortfallPence).toBe(0n)
  })

  it('overpayment carries forward to offset later months, never going negative', () => {
    const result = arrearsForProperty({
      expectedMonthlyPence: 100_000n,
      receivedByMonth: received({
        '2026-05': 150_000n, // half a month ahead
        '2026-06': 50_000n, // credit tops this up
        '2026-07': 100_000n,
      }),
      months: ['2026-05', '2026-06', '2026-07'],
    })
    expect(result.balancePence).toBe(0n)
    // The signed per-month shortfalls still show the raw cashflow shape.
    expect(result.months[0]?.shortfallPence).toBe(-50_000n)
    expect(result.months[1]?.shortfallPence).toBe(50_000n)
  })

  it('an entirely overpaid window ends at zero balance, not negative', () => {
    const result = arrearsForProperty({
      expectedMonthlyPence: 100_000n,
      receivedByMonth: received({ '2026-06': 500_000n }),
      months: ['2026-06', '2026-07'],
    })
    expect(result.balancePence).toBe(0n)
    expect(result.ageing.current).toBe(0n)
  })

  it('a catch-up payment clears the oldest debt first (FIFO)', () => {
    const result = arrearsForProperty({
      expectedMonthlyPence: 100_000n,
      receivedByMonth: received({
        '2026-05': 0n,
        '2026-06': 200_000n, // pays May + June together
        '2026-07': 100_000n,
      }),
      months: ['2026-05', '2026-06', '2026-07'],
    })
    expect(result.balancePence).toBe(0n)
  })

  it('allocates outstanding shortfall into ageing buckets by originating month', () => {
    const result = arrearsForProperty({
      expectedMonthlyPence: 100_000n,
      receivedByMonth: received({
        '2026-02': 100_000n,
        '2026-03': 100_000n,
        // 2026-04 unpaid entirely
        '2026-05': 0n,
        '2026-06': 0n,
        '2026-07': 0n,
      }),
      months: MONTHS,
    })
    expect(result.balancePence).toBe(400_000n)
    // Newest window month (July) = current, June = 30, May = 60, April = 90+.
    expect(result.ageing).toEqual({
      current: 100_000n,
      days30: 100_000n,
      days60: 100_000n,
      days90plus: 100_000n,
    })
  })

  it('partial receipts shift debt to newer buckets via FIFO allocation', () => {
    const result = arrearsForProperty({
      expectedMonthlyPence: 100_000n,
      receivedByMonth: received({
        '2026-05': 0n,
        '2026-06': 40_000n, // reduces May's debt, not June's
        '2026-07': 100_000n, // clears May's remainder, then dents June
      }),
      months: ['2026-05', '2026-06', '2026-07'],
    })
    // May 100k − 40k − 60k = 0; June 100k − 40k = 60k; July 100k unpaid.
    expect(result.balancePence).toBe(160_000n)
    expect(result.ageing).toEqual({
      current: 100_000n,
      days30: 60_000n,
      days60: 0n,
      days90plus: 0n,
    })
  })

  it('mid-window tenancy start only charges from its first full month', () => {
    const tenancies: ArrearsTenancy[] = [
      { rentPence: 100_000n, rentPeriod: 'monthly', status: 'active', startDate: '2026-05-10' },
    ]
    const result = arrearsForProperty({
      expectedMonthlyPence: expectedMonthlyRentPence(tenancies),
      receivedByMonth: [],
      months: MONTHS,
      expectedByMonthPence: expectedByMonth(tenancies, MONTHS),
    })
    // Chargeable from June only: June + July outstanding, nothing older.
    expect(result.balancePence).toBe(200_000n)
    expect(result.ageing).toEqual({
      current: 100_000n,
      days30: 100_000n,
      days60: 0n,
      days90plus: 0n,
    })
  })

  it('sums multiple receipt rows in the same month', () => {
    const result = arrearsForProperty({
      expectedMonthlyPence: 100_000n,
      receivedByMonth: [
        { month: '2026-07', receivedPence: 60_000n },
        { month: '2026-07', receivedPence: 40_000n },
      ],
      months: ['2026-07'],
    })
    expect(result.balancePence).toBe(0n)
    expect(result.months[0]?.receivedPence).toBe(100_000n)
  })

  it('handles empty inputs', () => {
    const result = arrearsForProperty({
      expectedMonthlyPence: 0n,
      receivedByMonth: [],
      months: [],
    })
    expect(result.balancePence).toBe(0n)
    expect(result.months).toEqual([])
    expect(result.ageing).toEqual({ current: 0n, days30: 0n, days60: 0n, days90plus: 0n })
  })

  it('no expectation (vacant property) never shows arrears even with no receipts', () => {
    const result = arrearsForProperty({
      expectedMonthlyPence: 0n,
      receivedByMonth: [],
      months: MONTHS,
    })
    expect(result.balancePence).toBe(0n)
  })
})
