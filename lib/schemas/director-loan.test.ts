import { describe, it, expect } from 'vitest'
import { DirectorLoanEntrySchema } from './director-loan'

const FIXED_ENTITY = '00000000-0000-0000-0000-000000000001'

// End-to-end schema parse — confirms the shared `pencePreprocessor`
// (which is also used by the unsigned-money schemas) accepts negative
// numeric strings without bouncing them. A regression here would
// silently break `loan_out` / `repayment` recording because the action
// would fail validation before the sign-violation guard ever runs.
describe('DirectorLoanEntrySchema — amountPence accepts both signs', () => {
  it('parses a positive loan_in', () => {
    const r = DirectorLoanEntrySchema.parse({
      entityId: FIXED_ENTITY,
      directorName: 'Alice',
      kind: 'loan_in',
      eventDate: '2026-05-01',
      amountPence: '100',
      description: null,
    })
    expect(r.amountPence).toBe(10_000n)
  })

  it('parses a negative loan_out (string form)', () => {
    const r = DirectorLoanEntrySchema.parse({
      entityId: FIXED_ENTITY,
      directorName: 'Alice',
      kind: 'loan_out',
      eventDate: '2026-05-01',
      amountPence: '-500',
      description: null,
    })
    expect(r.amountPence).toBe(-50_000n)
  })

  it('parses a £-prefixed comma-separated negative repayment', () => {
    const r = DirectorLoanEntrySchema.parse({
      entityId: FIXED_ENTITY,
      directorName: 'Alice',
      kind: 'repayment',
      eventDate: '2026-05-01',
      amountPence: '-£1,234.56',
      description: null,
    })
    expect(r.amountPence).toBe(-123_456n)
  })

  it('parses a numeric (non-string) negative', () => {
    const r = DirectorLoanEntrySchema.parse({
      entityId: FIXED_ENTITY,
      directorName: 'Alice',
      kind: 'loan_out',
      eventDate: '2026-05-01',
      amountPence: -100,
      description: null,
    })
    expect(r.amountPence).toBe(-10_000n)
  })

  it('rejects an un-parseable amount', () => {
    const r = DirectorLoanEntrySchema.safeParse({
      entityId: FIXED_ENTITY,
      directorName: 'Alice',
      kind: 'loan_in',
      eventDate: '2026-05-01',
      amountPence: 'garbage',
      description: null,
    })
    expect(r.success).toBe(false)
  })

  it('rejects an unknown kind', () => {
    const r = DirectorLoanEntrySchema.safeParse({
      entityId: FIXED_ENTITY,
      directorName: 'Alice',
      kind: 'bogus',
      eventDate: '2026-05-01',
      amountPence: '100',
      description: null,
    })
    expect(r.success).toBe(false)
  })

  it('trims and accepts a short director name', () => {
    const r = DirectorLoanEntrySchema.parse({
      entityId: FIXED_ENTITY,
      directorName: '  Bob  ',
      kind: 'loan_in',
      eventDate: '2026-05-01',
      amountPence: '100',
      description: '   ',
    })
    expect(r.directorName).toBe('Bob')
    // Description trims to empty → null.
    expect(r.description).toBeNull()
  })

  it('rejects an empty director name', () => {
    const r = DirectorLoanEntrySchema.safeParse({
      entityId: FIXED_ENTITY,
      directorName: '   ',
      kind: 'loan_in',
      eventDate: '2026-05-01',
      amountPence: '100',
      description: null,
    })
    expect(r.success).toBe(false)
  })
})
