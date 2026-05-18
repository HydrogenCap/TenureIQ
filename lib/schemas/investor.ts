// lib/schemas/investor.ts
// Investor + capital-account + transaction Zod schemas.

import { z } from 'zod'

export const INVESTOR_KINDS = ['individual', 'entity', 'spv'] as const
export type InvestorKind = (typeof INVESTOR_KINDS)[number]

export const ACCOUNT_KINDS = [
  'preferred_equity',
  'common_equity',
  'mezzanine_loan',
  'straight_loan',
] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const ACCOUNT_STATUSES = ['open', 'closed', 'defaulted'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export const TRANSACTION_KINDS = [
  'contribution',
  'distribution',
  'interest_accrual',
  'fee',
  'redemption',
  'adjustment',
] as const
export type InvestorTxKind = (typeof TRANSACTION_KINDS)[number]

const optionalString = (max = 200) =>
  z.preprocess(
    (v) => {
      if (v === null || v === undefined) return null
      if (typeof v === 'string') {
        const t = v.trim()
        return t.length === 0 ? null : t
      }
      return v
    },
    z.string().max(max).nullable(),
  )

const optionalEmail = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') {
      const t = v.trim()
      return t.length === 0 ? null : t
    }
    return v
  },
  z.string().email().nullable(),
)

const optionalDate = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === '') return null
    if (v instanceof Date) return v
    if (typeof v === 'string') return new Date(v)
    return v
  },
  z.date().nullable(),
)

const dateField = z.preprocess(
  (v) => {
    if (v instanceof Date) return v
    if (typeof v === 'string' && v.length > 0) return new Date(v)
    return v
  },
  z.date({ errorMap: () => ({ message: 'Invalid date' }) }),
)

const pence = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return v
    if (typeof v === 'bigint') return v
    if (typeof v === 'number') return BigInt(Math.round(v * 100))
    if (typeof v === 'string') {
      const cleaned = v.replace(/[£,\s]/g, '')
      if (cleaned === '') return v
      const n = Number(cleaned)
      if (!Number.isFinite(n)) return v
      return BigInt(Math.round(n * 100))
    }
    return v
  },
  z.bigint().nonnegative(),
)

// Signed pence — supports the contribution-positive / distribution-
// negative convention.
const signedPence = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return v
    if (typeof v === 'bigint') return v
    if (typeof v === 'number') return BigInt(Math.round(v * 100))
    if (typeof v === 'string') {
      const cleaned = v.replace(/[£,\s]/g, '')
      if (cleaned === '') return v
      const n = Number(cleaned)
      if (!Number.isFinite(n)) return v
      return BigInt(Math.round(n * 100))
    }
    return v
  },
  z.bigint(),
)

const optionalUuid = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? null : v),
  z.string().uuid().nullable(),
)

export const InvestorCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  kind: z.enum(INVESTOR_KINDS),
  contactEmail: optionalEmail,
  contactPhone: optionalString(40),
  addressLine1: optionalString(200),
  addressLine2: optionalString(200),
  city: optionalString(100),
  postcode: optionalString(20),
  country: optionalString(80),
  taxId: optionalString(40),
  dateOfBirth: optionalDate,
  nationalIdKind: z.preprocess(
    (v) => (v === null || v === undefined || v === '' ? null : v),
    z.enum(['ni', 'company_utr', 'passport']).nullable(),
  ),
  notes: optionalString(2000),
})
export type InvestorCreate = z.infer<typeof InvestorCreateSchema>

export const OpenAccountSchema = z.object({
  investorId: z.string().uuid(),
  entityId: z.string().uuid(),
  kind: z.enum(ACCOUNT_KINDS),
  terms: z.record(z.unknown()).default({}),
  commitmentPence: pence,
  startDate: dateField,
})
export type OpenAccountInput = z.infer<typeof OpenAccountSchema>

export const CloseAccountSchema = z.object({
  accountId: z.string().uuid(),
  redemptionAmountPence: pence,
  redemptionDate: dateField,
  linkedTransactionId: optionalUuid,
  notes: optionalString(2000),
})
export type CloseAccountInput = z.infer<typeof CloseAccountSchema>

export const RecordInvestorTxSchema = z.object({
  accountId: z.string().uuid(),
  kind: z.enum(TRANSACTION_KINDS),
  amountPence: signedPence,
  transactionDate: dateField,
  linkedTransactionId: optionalUuid,
  sourceDocumentId: optionalUuid,
  notes: optionalString(2000),
})
export type RecordInvestorTxInput = z.infer<typeof RecordInvestorTxSchema>
