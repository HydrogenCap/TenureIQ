import { describe, it, expect } from 'vitest'
import {
  currentInterestRateBps,
  monthlyInterestPence,
  monthsUntil,
  daysUntilFixedEnd,
  deriveBalancePence,
} from './mortgage'

describe('currentInterestRateBps', () => {
  const base = {
    interestRateBps: 525,
    fixedEndDate: null,
    currentBalancePence: 20_000_000n,
    isInterestOnly: false,
  }

  it('falls back to mortgage.interestRateBps when no events', () => {
    expect(currentInterestRateBps(base, [])).toBe(525)
  })

  it('picks the most-recent rate_change before asOf', () => {
    const rate = currentInterestRateBps(
      base,
      [
        {
          eventDate: '2025-01-01',
          kind: 'rate_change',
          ratePostBps: 450,
          amountPence: null,
          balancePence: null,
        },
        {
          eventDate: '2026-01-01',
          kind: 'rate_change',
          ratePostBps: 600,
          amountPence: null,
          balancePence: null,
        },
      ],
      new Date('2026-05-15'),
    )
    expect(rate).toBe(600)
  })

  it('ignores rate_changes after asOf', () => {
    const rate = currentInterestRateBps(
      base,
      [
        {
          eventDate: '2027-01-01',
          kind: 'rate_change',
          ratePostBps: 700,
          amountPence: null,
          balancePence: null,
        },
      ],
      new Date('2026-05-15'),
    )
    expect(rate).toBe(525) // unchanged — future event ignored
  })

  it('treats product_switch as a rate event', () => {
    const rate = currentInterestRateBps(
      base,
      [
        {
          eventDate: '2026-03-01',
          kind: 'product_switch',
          ratePostBps: 475,
          amountPence: null,
          balancePence: null,
        },
      ],
      new Date('2026-05-15'),
    )
    expect(rate).toBe(475)
  })

  it('ignores rate events with null ratePostBps', () => {
    const rate = currentInterestRateBps(
      base,
      [
        {
          eventDate: '2026-03-01',
          kind: 'rate_change',
          ratePostBps: null,
          amountPence: null,
          balancePence: null,
        },
      ],
      new Date('2026-05-15'),
    )
    expect(rate).toBe(525)
  })
})

describe('monthlyInterestPence', () => {
  it('computes monthly interest from balance × rate ÷ 12', () => {
    // £200k balance, 5.25% rate → £200k × 0.0525 ÷ 12 = £875/month
    expect(monthlyInterestPence(20_000_000n, 525)).toBe(87_500n)
  })

  it('returns 0 for zero or negative rate', () => {
    expect(monthlyInterestPence(20_000_000n, 0)).toBe(0n)
    expect(monthlyInterestPence(20_000_000n, -100)).toBe(0n)
  })

  it('returns 0 for zero balance', () => {
    expect(monthlyInterestPence(0n, 525)).toBe(0n)
  })

  it('worked example: £250k @ 4.5%', () => {
    // £250k × 0.045 ÷ 12 = £937.50 → 93750 pence
    expect(monthlyInterestPence(25_000_000n, 450)).toBe(93_750n)
  })
})

describe('monthsUntil', () => {
  const today = new Date('2026-05-15')

  it('returns 0 for today', () => {
    expect(monthsUntil('2026-05-15', today)).toBe(0)
  })

  it('returns positive months for a future date', () => {
    expect(monthsUntil('2026-11-15', today)).toBe(6)
    expect(monthsUntil('2027-05-15', today)).toBe(12)
  })

  it('returns negative months for past', () => {
    expect(monthsUntil('2025-05-15', today)).toBe(-12)
  })

  it('adjusts for day-of-month not yet arrived', () => {
    // 14th < 15th → not yet a full month
    expect(monthsUntil('2026-11-14', today)).toBe(5)
  })
})

describe('daysUntilFixedEnd', () => {
  const today = new Date('2026-05-15')

  it('returns null when no fixed end set', () => {
    expect(
      daysUntilFixedEnd(
        {
          interestRateBps: 525,
          fixedEndDate: null,
          currentBalancePence: 0n,
          isInterestOnly: false,
        },
        today,
      ),
    ).toBeNull()
  })

  it('counts days until the fixed end', () => {
    expect(
      daysUntilFixedEnd(
        {
          interestRateBps: 525,
          fixedEndDate: '2026-08-15',
          currentBalancePence: 0n,
          isInterestOnly: false,
        },
        today,
      ),
    ).toBe(92) // 31 (May 16-31) + 30 (June) + 31 (July) + 14 (Aug 1-14, since Aug 15 itself ends just under 1d offset depending on time-of-day) = ~92
  })

  it('is negative for an already-passed fixed end', () => {
    expect(
      daysUntilFixedEnd(
        {
          interestRateBps: 525,
          fixedEndDate: '2026-01-15',
          currentBalancePence: 0n,
          isInterestOnly: false,
        },
        today,
      ),
    ).toBeLessThan(0)
  })
})

describe('deriveBalancePence', () => {
  it('returns initial balance with no events', () => {
    expect(deriveBalancePence(20_000_000n, [])).toBe(20_000_000n)
  })

  it('decrements by payment.amountPence', () => {
    const events = [
      {
        eventDate: '2026-02-01',
        kind: 'payment',
        ratePostBps: null,
        amountPence: 100_000n,
        balancePence: null,
      },
      {
        eventDate: '2026-03-01',
        kind: 'payment',
        ratePostBps: null,
        amountPence: 100_000n,
        balancePence: null,
      },
    ]
    expect(deriveBalancePence(20_000_000n, events)).toBe(19_800_000n)
  })

  it('does NOT decrement on payment_interest_only', () => {
    const events = [
      {
        eventDate: '2026-02-01',
        kind: 'payment_interest_only',
        ratePostBps: null,
        amountPence: 87_500n,
        balancePence: null,
      },
    ]
    expect(deriveBalancePence(20_000_000n, events)).toBe(20_000_000n)
  })

  it('uses the latest reconciliation as the baseline', () => {
    const events = [
      {
        eventDate: '2026-02-01',
        kind: 'payment',
        ratePostBps: null,
        amountPence: 100_000n,
        balancePence: null,
      },
      {
        eventDate: '2026-03-01',
        kind: 'reconciliation',
        ratePostBps: null,
        amountPence: null,
        balancePence: 18_500_000n,
      },
      {
        eventDate: '2026-04-01',
        kind: 'payment',
        ratePostBps: null,
        amountPence: 100_000n,
        balancePence: null,
      },
    ]
    // baseline becomes 18,500,000 at 2026-03-01; one payment after → 18,400,000
    expect(deriveBalancePence(20_000_000n, events)).toBe(18_400_000n)
  })

  it('clamps at 0n (can never be negative)', () => {
    const events = [
      {
        eventDate: '2026-02-01',
        kind: 'payment',
        ratePostBps: null,
        amountPence: 30_000_000n,
        balancePence: null,
      },
    ]
    expect(deriveBalancePence(20_000_000n, events)).toBe(0n)
  })
})
