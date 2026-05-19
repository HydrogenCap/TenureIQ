// lib/schemas/director-loan.ts
// Director's loan account ledger entry. One row per movement; balance
// is derived via lib/domain/director-loan.ts:directorLoanBalancePence.

import { z } from 'zod'
import { pencePreprocessor } from '@/lib/money'

export const DIRECTOR_LOAN_KINDS = [
  'loan_in',
  'loan_out',
  'interest_accrued',
  'repayment',
] as const
export type DirectorLoanKindZ = (typeof DIRECTOR_LOAN_KINDS)[number]

const signedPence = z.preprocess(pencePreprocessor, z.bigint())

const dateField = z.preprocess(
  (v) => {
    if (v instanceof Date) return v
    if (typeof v === 'string' && v.length > 0) return new Date(v)
    return v
  },
  z.date({ errorMap: () => ({ message: 'Invalid date' }) }),
)

export const DirectorLoanEntrySchema = z.object({
  entityId: z.string().uuid('Choose an entity'),
  directorName: z.string().trim().min(1, 'Director name required').max(200),
  kind: z.enum(DIRECTOR_LOAN_KINDS),
  eventDate: dateField,
  amountPence: signedPence,
  description: z.preprocess(
    (v) => {
      if (v === null || v === undefined) return null
      if (typeof v === 'string') {
        const t = v.trim()
        return t.length === 0 ? null : t
      }
      return v
    },
    z.string().max(1000).nullable(),
  ),
})

export type DirectorLoanEntry = z.infer<typeof DirectorLoanEntrySchema>
