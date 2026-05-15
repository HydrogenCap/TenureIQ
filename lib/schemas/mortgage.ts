// lib/schemas/mortgage.ts
import { z } from 'zod'

export const MORTGAGE_PRODUCTS = [
  'fixed',
  'tracker',
  'svr',
  'discount',
  'bridging',
  'development',
] as const
export type MortgageProduct = (typeof MORTGAGE_PRODUCTS)[number]

export const MORTGAGE_EVENT_KINDS = [
  'drawdown',
  'payment',
  'payment_interest_only',
  'rate_change',
  'product_switch',
  'redemption',
  'er_charge',
  'reconciliation',
] as const
export type MortgageEventKind = (typeof MORTGAGE_EVENT_KINDS)[number]

const optionalString = (max = 200) =>
  z.preprocess(
    (v) => {
      if (v === null || v === undefined) return null
      if (typeof v === 'string') {
        const trimmed = v.trim()
        return trimmed.length === 0 ? null : trimmed
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
      return Number.isFinite(n) ? BigInt(Math.round(n * 100)) : v
    }
    return v
  },
  z.bigint().nonnegative('Must be a non-negative amount in £'),
)

const optionalPence = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'bigint') return v
    if (typeof v === 'number') return BigInt(Math.round(v * 100))
    if (typeof v === 'string') {
      const cleaned = v.replace(/[£,\s]/g, '')
      if (cleaned === '') return null
      const n = Number(cleaned)
      return Number.isFinite(n) ? BigInt(Math.round(n * 100)) : v
    }
    return v
  },
  z.bigint().nonnegative().nullable(),
)

// Basis points: accept "4.5" / "4.5%" / 4.5 as percent, convert to bps.
// Always treat numeric input as percent — no boundary-magic heuristic.
// (Earlier version split on <100; that produced surprising off-by-99
// behaviour at integer boundaries — flagged by security review.)
const bps = z.preprocess(
  (v) => {
    if (typeof v === 'number') {
      return Math.round(v * 100)
    }
    if (typeof v === 'string') {
      const cleaned = v.replace(/[%\s]/g, '')
      const n = Number(cleaned)
      if (!Number.isFinite(n)) return v
      return Math.round(n * 100)
    }
    return v
  },
  z.number().int().min(0, 'Rate cannot be negative').max(10_000, 'Rate cannot exceed 100%'),
)

const optionalBps = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'number') return Math.round(v * 100)
    if (typeof v === 'string') {
      const cleaned = v.replace(/[%\s]/g, '')
      const n = Number(cleaned)
      if (!Number.isFinite(n)) return v
      return Math.round(n * 100)
    }
    return v
  },
  z.number().int().min(0).max(10_000).nullable(),
)

const dateField = z.preprocess(
  (v) => {
    if (v instanceof Date) return v
    if (typeof v === 'string' && v.length > 0) return new Date(v)
    return v
  },
  z.date({ errorMap: () => ({ message: 'Invalid date' }) }),
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

export const MortgageCreateSchema = z.object({
  propertyId: z.string().uuid('Choose a property'),
  lender: z.string().trim().min(1, 'Lender is required').max(120),
  accountRef: optionalString(80),
  product: z.enum(MORTGAGE_PRODUCTS).default('fixed'),
  originalLoanPence: pence,
  currentBalancePence: pence,
  interestRateBps: bps,
  monthlyPaymentPence: pence,
  termMonths: z.preprocess(
    (v) => {
      if (typeof v === 'string') {
        const n = Number(v)
        return Number.isFinite(n) ? Math.round(n) : v
      }
      return v
    },
    z.number().int().min(1).max(600),
  ),
  fixedEndDate: optionalDate,
  isInterestOnly: z.preprocess(
    (v) => (v === null || v === undefined ? false : v),
    z.coerce.boolean(),
  ),
  broker: optionalString(120),
  notes: optionalString(2000),
})

export const MortgageUpdateSchema = MortgageCreateSchema
export type MortgageCreate = z.infer<typeof MortgageCreateSchema>
export type MortgageUpdate = z.infer<typeof MortgageUpdateSchema>

export const RecordMortgageEventSchema = z
  .object({
    mortgageId: z.string().uuid(),
    kind: z.enum(MORTGAGE_EVENT_KINDS),
    eventDate: dateField,
    amountPence: optionalPence,
    ratePostBps: optionalBps,
    balancePence: optionalPence,
    notes: optionalString(2000),
  })
  .refine(
    (v) =>
      (v.kind !== 'payment' && v.kind !== 'redemption' && v.kind !== 'payment_interest_only') ||
      v.amountPence !== null,
    { message: 'Amount is required for this event kind', path: ['amountPence'] },
  )
  .refine(
    (v) => v.kind !== 'rate_change' || v.ratePostBps !== null,
    { message: 'New rate is required', path: ['ratePostBps'] },
  )
  .refine(
    (v) => v.kind !== 'reconciliation' || v.balancePence !== null,
    { message: 'Balance is required for a reconciliation', path: ['balancePence'] },
  )

export type RecordMortgageEventInput = z.infer<typeof RecordMortgageEventSchema>

export const SetCurrentBalanceSchema = z.object({
  mortgageId: z.string().uuid(),
  balancePence: pence,
  asOf: dateField,
  source: z.string().trim().min(1).max(200),
  notes: optionalString(2000),
})

export type SetCurrentBalanceInput = z.infer<typeof SetCurrentBalanceSchema>
