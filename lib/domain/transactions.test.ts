import { describe, it, expect } from 'vitest'
import {
  monthlyPandL,
  annualPandL,
  last12Months,
  categoriseAgainstRules,
  type TransactionLike,
  type CategoryRule,
} from './transactions'

const tx = (
  date: string,
  amount: bigint,
  category: string,
  extras: Partial<TransactionLike> = {},
): TransactionLike => ({
  postedAt: date,
  amountPence: amount,
  categoryCode: category,
  ...extras,
})

describe('monthlyPandL', () => {
  it('returns zeros when no transactions match', () => {
    const r = monthlyPandL({ transactions: [], month: { year: 2026, month: 1 } })
    expect(r.creditsPence).toBe(0n)
    expect(r.debitsPence).toBe(0n)
    expect(r.netPence).toBe(0n)
    expect(r.byCategory).toEqual({})
  })

  it('aggregates credits and debits separately, net = sum', () => {
    const r = monthlyPandL({
      transactions: [
        tx('2026-05-01', 65_000n, 'rent'),
        tx('2026-05-15', -10_000n, 'maintenance'),
        tx('2026-05-20', -91_500n, 'mortgage_payment'),
        tx('2026-04-30', 65_000n, 'rent'), // wrong month
      ],
      month: { year: 2026, month: 5 },
    })
    expect(r.creditsPence).toBe(65_000n)
    expect(r.debitsPence).toBe(-101_500n)
    expect(r.netPence).toBe(-36_500n)
    expect(r.byCategory).toEqual({
      rent: 65_000n,
      maintenance: -10_000n,
      mortgage_payment: -91_500n,
    })
  })

  it('filters by propertyId when supplied', () => {
    const r = monthlyPandL({
      transactions: [
        tx('2026-05-01', 65_000n, 'rent', { propertyId: 'p1' }),
        tx('2026-05-01', 50_000n, 'rent', { propertyId: 'p2' }),
        tx('2026-05-01', 30_000n, 'rent', { propertyId: null }),
      ],
      month: { year: 2026, month: 5 },
      propertyId: 'p1',
    })
    expect(r.creditsPence).toBe(65_000n)
  })

  it('excludes split parents from totals', () => {
    const r = monthlyPandL({
      transactions: [
        tx('2026-05-01', -60_000n, 'mortgage_payment', { isSplitParent: true }),
        tx('2026-05-01', -40_000n, 'mortgage_interest'),
        tx('2026-05-01', -20_000n, 'mortgage_capital'),
      ],
      month: { year: 2026, month: 5 },
    })
    // Only the children count
    expect(r.debitsPence).toBe(-60_000n)
    expect(r.byCategory['mortgage_interest']).toBe(-40_000n)
    expect(r.byCategory['mortgage_capital']).toBe(-20_000n)
    expect(r.byCategory['mortgage_payment']).toBeUndefined()
  })
})

describe('annualPandL', () => {
  it('rolls up a full calendar year', () => {
    const txs: TransactionLike[] = []
    for (let m = 0; m < 12; m++) {
      txs.push(tx(`2026-${String(m + 1).padStart(2, '0')}-01`, 65_000n, 'rent'))
    }
    const r = annualPandL({ transactions: txs, year: 2026 })
    expect(r.creditsPence).toBe(65_000n * 12n)
  })

  it('skips other years', () => {
    const r = annualPandL({
      transactions: [tx('2025-12-31', 65_000n, 'rent'), tx('2026-01-01', 50_000n, 'rent')],
      year: 2026,
    })
    expect(r.creditsPence).toBe(50_000n)
  })
})

describe('last12Months', () => {
  it('returns 12 months oldest-first ending at endMonth', () => {
    const r = last12Months({
      transactions: [tx('2026-05-15', 65_000n, 'rent')],
      endMonth: { year: 2026, month: 5 },
    })
    expect(r).toHaveLength(12)
    // Oldest first → June 2025
    expect(r[0]?.year).toBe(2025)
    expect(r[0]?.month).toBe(6)
    expect(r[11]?.year).toBe(2026)
    expect(r[11]?.month).toBe(5)
    expect(r[11]?.creditsPence).toBe(65_000n)
    expect(r[0]?.creditsPence).toBe(0n)
  })
})

describe('categoriseAgainstRules', () => {
  const rules: CategoryRule[] = [
    {
      pattern: 'Nationwide',
      isRegex: false,
      categoryCode: 'mortgage_payment',
      propertyId: 'p1',
      signRequired: 'debit',
    },
    {
      pattern: '/^STO RENT/i',
      isRegex: true,
      categoryCode: 'rent',
      propertyId: 'p1',
      signRequired: 'credit',
    },
  ]

  it('matches substring (case-insensitive)', () => {
    const r = categoriseAgainstRules('NATIONWIDE BS', -91_500n, rules)
    expect(r).toEqual({ categoryCode: 'mortgage_payment', propertyId: 'p1' })
  })

  it('matches regex pattern', () => {
    const r = categoriseAgainstRules('STO RENT JOHN DOE', 65_000n, rules)
    expect(r).toEqual({ categoryCode: 'rent', propertyId: 'p1' })
  })

  it('returns null when no rule matches', () => {
    const r = categoriseAgainstRules('TESCO STORES', -5_000n, rules)
    expect(r).toBeNull()
  })

  it('skips rules whose required sign mismatches the amount', () => {
    // The Nationwide rule is debit-only; a credit description containing
    // "Nationwide" should not match it.
    const r = categoriseAgainstRules('Nationwide refund', 50_000n, rules)
    expect(r).toBeNull()
  })

  it('first rule wins', () => {
    const broader: CategoryRule[] = [
      { pattern: 'rent', isRegex: false, categoryCode: 'rent', propertyId: null, signRequired: null },
      { pattern: 'rent', isRegex: false, categoryCode: 'other_income', propertyId: null, signRequired: null },
    ]
    const r = categoriseAgainstRules('March rent', 65_000n, broader)
    expect(r?.categoryCode).toBe('rent')
  })

  it('treats malformed regex as no-match (does not throw)', () => {
    const bad: CategoryRule[] = [
      { pattern: '/[/', isRegex: true, categoryCode: 'rent', propertyId: null, signRequired: null },
    ]
    expect(() => categoriseAgainstRules('foo', 1n, bad)).not.toThrow()
    expect(categoriseAgainstRules('foo', 1n, bad)).toBeNull()
  })
})
