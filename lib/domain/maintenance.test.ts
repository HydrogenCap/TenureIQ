import { describe, it, expect } from 'vitest'
import {
  daysOpen,
  slaBreached,
  slaWindowHours,
  propertyMaintenanceSpendPence,
  last12MonthsSpendPence,
} from './maintenance'

describe('daysOpen', () => {
  const reported = new Date('2026-05-01T10:00:00Z')
  it('counts days from reported to now for open jobs', () => {
    const now = new Date('2026-05-10T10:00:00Z')
    expect(
      daysOpen(
        { priority: 'normal', status: 'in_progress', reportedAt: reported, completedAt: null },
        now,
      ),
    ).toBe(9)
  })
  it('uses completedAt when present', () => {
    expect(
      daysOpen({
        priority: 'normal',
        status: 'completed',
        reportedAt: reported,
        completedAt: new Date('2026-05-05T10:00:00Z'),
      }),
    ).toBe(4)
  })
  it('returns 0 for same-day completion', () => {
    expect(
      daysOpen({
        priority: 'emergency',
        status: 'completed',
        reportedAt: reported,
        completedAt: new Date('2026-05-01T12:00:00Z'),
      }),
    ).toBe(0)
  })
})

describe('slaBreached', () => {
  const reported = new Date('2026-05-01T10:00:00Z')

  it('emergency breaches after 24h', () => {
    const justAfter = new Date(reported.getTime() + 25 * 3_600_000)
    expect(
      slaBreached(
        { priority: 'emergency', status: 'reported', reportedAt: reported, completedAt: null },
        justAfter,
      ),
    ).toBe(true)
  })
  it('emergency does not breach inside 24h', () => {
    const inside = new Date(reported.getTime() + 23 * 3_600_000)
    expect(
      slaBreached(
        { priority: 'emergency', status: 'reported', reportedAt: reported, completedAt: null },
        inside,
      ),
    ).toBe(false)
  })
  it('urgent breach window is 5 days', () => {
    const sixDays = new Date(reported.getTime() + 6 * 86_400_000)
    expect(
      slaBreached(
        { priority: 'urgent', status: 'triaged', reportedAt: reported, completedAt: null },
        sixDays,
      ),
    ).toBe(true)
  })
  it('normal breach window is 21 days', () => {
    const twentyTwo = new Date(reported.getTime() + 22 * 86_400_000)
    expect(
      slaBreached(
        { priority: 'normal', status: 'awaiting_quote', reportedAt: reported, completedAt: null },
        twentyTwo,
      ),
    ).toBe(true)
  })
  it('low breach window is 90 days', () => {
    const ninetyOne = new Date(reported.getTime() + 91 * 86_400_000)
    expect(
      slaBreached(
        { priority: 'low', status: 'reported', reportedAt: reported, completedAt: null },
        ninetyOne,
      ),
    ).toBe(true)
  })
  it('completed jobs never breach', () => {
    const ages = new Date(reported.getTime() + 365 * 86_400_000)
    expect(
      slaBreached(
        {
          priority: 'emergency',
          status: 'completed',
          reportedAt: reported,
          completedAt: new Date(reported.getTime() + 12 * 3_600_000),
        },
        ages,
      ),
    ).toBe(false)
  })
  it('cancelled jobs never breach', () => {
    const ages = new Date(reported.getTime() + 365 * 86_400_000)
    expect(
      slaBreached(
        { priority: 'urgent', status: 'cancelled', reportedAt: reported, completedAt: null },
        ages,
      ),
    ).toBe(false)
  })
})

describe('slaWindowHours', () => {
  it('returns the right hours per priority', () => {
    expect(slaWindowHours('emergency')).toBe(24)
    expect(slaWindowHours('urgent')).toBe(120)
    expect(slaWindowHours('normal')).toBe(504)
    expect(slaWindowHours('low')).toBe(2160)
  })
})

describe('propertyMaintenanceSpendPence', () => {
  it('sums in-range invoices including VAT', () => {
    const total = propertyMaintenanceSpendPence({
      invoices: [
        { amountPence: 10_000n, vatPence: 2_000n, invoiceDate: '2026-03-15' },
        { amountPence: 5_000n, vatPence: 1_000n, invoiceDate: '2026-04-01' },
        { amountPence: 99_000n, vatPence: 0n, invoiceDate: '2025-12-31' }, // out of range
      ],
      period: {
        from: new Date('2026-01-01'),
        to: new Date('2026-12-31'),
      },
    })
    expect(total).toBe(18_000n)
  })
  it('excludes soft-deleted', () => {
    const total = propertyMaintenanceSpendPence({
      invoices: [
        {
          amountPence: 10_000n,
          vatPence: 0n,
          invoiceDate: '2026-05-01',
          deletedAt: '2026-05-02',
        },
      ],
      period: { from: new Date('2026-01-01'), to: new Date('2026-12-31') },
    })
    expect(total).toBe(0n)
  })
})

describe('last12MonthsSpendPence', () => {
  it('sums everything within the last 12 calendar months', () => {
    const now = new Date('2026-05-15')
    const total = last12MonthsSpendPence(
      [
        { amountPence: 10_000n, vatPence: 0n, invoiceDate: '2026-04-01' },
        { amountPence: 10_000n, vatPence: 0n, invoiceDate: '2025-06-01' },
        { amountPence: 10_000n, vatPence: 0n, invoiceDate: '2025-04-01' }, // out of range
      ],
      now,
    )
    expect(total).toBe(20_000n)
  })
})
