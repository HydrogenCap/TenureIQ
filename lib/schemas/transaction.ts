// lib/schemas/transaction.ts

import { z } from 'zod'
import { pencePreprocessor } from '@/lib/money'
import { TRANSACTION_CATEGORIES } from '@/lib/domain/transactions'

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

// Signed pence — accepts £/comma/sign-prefix. Sign on transactions is
// preserved: positive = credit (money in), negative = debit.
const signedPence = z.preprocess(pencePreprocessor, z.bigint())

const dateField = z.preprocess(
  (v) => {
    if (v instanceof Date) return v
    if (typeof v === 'string' && v.length > 0) return new Date(v)
    return v
  },
  z.date({ errorMap: () => ({ message: 'Invalid date' }) }),
)

const optionalUuid = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? null : v),
  z.string().uuid().nullable(),
)

export const TransactionCreateSchema = z.object({
  bankAccountId: optionalUuid,
  postedAt: dateField
    .refine((d) => d.getTime() <= Date.now() + 30 * 86_400_000, {
      message: 'Posted date cannot be more than 30 days in the future.',
    })
    .refine((d) => d.getTime() >= Date.UTC(2000, 0, 1), {
      message: 'Posted date looks wrong — must be on or after 2000-01-01.',
    }),
  description: z.string().trim().min(1, 'Description is required').max(500),
  amountPence: signedPence,
  categoryCode: z.enum(TRANSACTION_CATEGORIES).default('uncategorised'),
  propertyId: optionalUuid,
  reference: optionalString(120),
})

export const TransactionUpdateSchema = TransactionCreateSchema

export type TransactionCreate = z.infer<typeof TransactionCreateSchema>
export type TransactionUpdate = z.infer<typeof TransactionUpdateSchema>

export const RecategoriseSchema = z.object({
  transactionId: z.string().uuid(),
  categoryCode: z.enum(TRANSACTION_CATEGORIES),
  propertyId: optionalUuid,
  // If true, ALSO create a rule that auto-categorises future imports
  // matching the same description fragment.
  createRule: z.preprocess(
    (v) => (v === null || v === undefined ? false : v),
    z.coerce.boolean(),
  ),
  rulePattern: optionalString(200),
})

export type RecategoriseInput = z.infer<typeof RecategoriseSchema>

export const BulkRecategoriseSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(500),
  categoryCode: z.enum(TRANSACTION_CATEGORIES),
  propertyId: optionalUuid,
})

export type BulkRecategoriseInput = z.infer<typeof BulkRecategoriseSchema>
