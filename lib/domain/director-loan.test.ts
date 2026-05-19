import { describe, it, expect } from 'vitest'
import {
  directorLoanSignViolation,
  directorLoanBalancePence,
  directorLoanBalancesByDirector,
} from './director-loan'

describe('directorLoanSignViolation', () => {
  it('accepts the canonical happy paths', () => {
    expect(directorLoanSignViolation('loan_in', 100_000n)).toBeNull()
    expect(directorLoanSignViolation('interest_accrued', 1_000n)).toBeNull()
    expect(directorLoanSignViolation('loan_out', -50_000n)).toBeNull()
    expect(directorLoanSignViolation('repayment', -25_000n)).toBeNull()
  })

  it('rejects positive loan_out / repayment', () => {
    expect(directorLoanSignViolation('loan_out', 100n)).toContain('negative')
    expect(directorLoanSignViolation('repayment', 100n)).toContain('negative')
  })

  it('rejects negative loan_in / interest_accrued', () => {
    expect(directorLoanSignViolation('loan_in', -100n)).toContain('positive')
    expect(directorLoanSignViolation('interest_accrued', -100n)).toContain('positive')
  })

  it('rejects zero on every kind', () => {
    const kinds = ['loan_in', 'loan_out', 'interest_accrued', 'repayment'] as const
    for (const k of kinds) {
      expect(directorLoanSignViolation(k, 0n)).toContain('non-zero')
    }
  })
})

describe('directorLoanBalancePence', () => {
  it('sums signed amounts', () => {
    const events = [
      { eventDate: '2026-01-01', amountPence: 100_000_00n }, // loan in
      { eventDate: '2026-04-01', amountPence: 1_500_00n }, // interest
      { eventDate: '2026-06-01', amountPence: -30_000_00n }, // repayment
    ]
    expect(directorLoanBalancePence(events, new Date('2026-12-31'))).toBe(71_500_00n)
  })

  it('respects the asOf date — future events excluded', () => {
    const events = [
      { eventDate: '2026-01-01', amountPence: 100_000n },
      { eventDate: '2027-01-01', amountPence: -50_000n },
    ]
    expect(directorLoanBalancePence(events, new Date('2026-06-30'))).toBe(100_000n)
  })

  it('excludes soft-deleted events', () => {
    const events = [
      { eventDate: '2026-01-01', amountPence: 100_000n },
      { eventDate: '2026-02-01', amountPence: -10_000n, deletedAt: '2026-03-01' },
    ]
    expect(directorLoanBalancePence(events, new Date('2026-12-31'))).toBe(100_000n)
  })

  it('returns 0 for an empty ledger', () => {
    expect(directorLoanBalancePence([], new Date())).toBe(0n)
  })

  it('correctly reports a negative (overdrawn) balance', () => {
    // Director took more out than they put in — s455 CTA 2010 territory.
    const events = [
      { eventDate: '2026-01-01', amountPence: 10_000n },
      { eventDate: '2026-02-01', amountPence: -30_000n },
    ]
    expect(directorLoanBalancePence(events, new Date('2026-12-31'))).toBe(-20_000n)
  })
})

describe('directorLoanBalancesByDirector', () => {
  it('groups by director name', () => {
    const events = [
      { eventDate: '2026-01-01', amountPence: 100_000n, directorName: 'Alice' },
      { eventDate: '2026-02-01', amountPence: 50_000n, directorName: 'Bob' },
      { eventDate: '2026-03-01', amountPence: -20_000n, directorName: 'Alice' },
    ]
    const result = directorLoanBalancesByDirector(events)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      directorName: 'Alice',
      balancePence: 80_000n,
      isOverdrawn: false,
    })
    expect(result[1]).toEqual({
      directorName: 'Bob',
      balancePence: 50_000n,
      isOverdrawn: false,
    })
  })

  it('flags overdrawn directors', () => {
    const events = [
      { eventDate: '2026-01-01', amountPence: 5_000n, directorName: 'Carol' },
      { eventDate: '2026-02-01', amountPence: -10_000n, directorName: 'Carol' },
    ]
    const result = directorLoanBalancesByDirector(events)
    expect(result[0]!.isOverdrawn).toBe(true)
    expect(result[0]!.balancePence).toBe(-5_000n)
  })

  it('returns an empty array for no events', () => {
    expect(directorLoanBalancesByDirector([])).toEqual([])
  })

  it('excludes soft-deleted events from the per-director rollup', () => {
    const events = [
      { eventDate: '2026-01-01', amountPence: 10_000n, directorName: 'Dan' },
      {
        eventDate: '2026-02-01',
        amountPence: 5_000n,
        directorName: 'Dan',
        deletedAt: '2026-03-01',
      },
    ]
    expect(directorLoanBalancesByDirector(events)[0]!.balancePence).toBe(10_000n)
  })
})
