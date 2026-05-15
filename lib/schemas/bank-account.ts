// lib/schemas/bank-account.ts

import { z } from 'zod'

export const BANK_ACCOUNT_KINDS = [
  'current',
  'savings',
  'client_money',
  'tenant_deposit',
] as const
export type BankAccountKind = (typeof BANK_ACCOUNT_KINDS)[number]

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
  z.bigint(),
)

const dateField = z.preprocess(
  (v) => {
    if (v instanceof Date) return v
    if (typeof v === 'string' && v.length > 0) return new Date(v)
    return v
  },
  z.date({ errorMap: () => ({ message: 'Invalid date' }) }),
)

// UK sort code: optional, accepts "12-34-56" or "123456".
const sortCode = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') {
      const cleaned = v.replace(/[-\s]/g, '')
      if (cleaned.length === 0) return null
      return cleaned
    }
    return v
  },
  z.string().regex(/^\d{6}$/, 'Sort code must be 6 digits').nullable(),
)

const last4 = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') {
      const cleaned = v.trim()
      return cleaned.length === 0 ? null : cleaned
    }
    return v
  },
  z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits').nullable(),
)

export const BankAccountCreateSchema = z.object({
  entityId: z.string().uuid('Choose an entity'),
  label: z.string().trim().min(1, 'Name is required').max(120),
  bankName: optionalString(120),
  kind: z.enum(BANK_ACCOUNT_KINDS).default('current'),
  sortCode,
  accountNumberLast4: last4,
  openingBalancePence: pence,
  openingBalanceDate: dateField,
  notes: optionalString(2000),
})

export const BankAccountUpdateSchema = BankAccountCreateSchema
export type BankAccountCreate = z.infer<typeof BankAccountCreateSchema>
export type BankAccountUpdate = z.infer<typeof BankAccountUpdateSchema>
