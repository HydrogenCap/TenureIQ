// lib/schemas/valuation.ts
import { z } from 'zod'

export const VALUATION_KINDS = [
  'estimate',
  'estate_agent',
  'red_book',
  'refinance',
  'purchase',
  'desktop',
] as const
export type ValuationKind = (typeof VALUATION_KINDS)[number]

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
  z.bigint().positive('Valuation must be positive'),
)

const dateField = z.preprocess(
  (v) => {
    if (v instanceof Date) return v
    if (typeof v === 'string' && v.length > 0) return new Date(v)
    return v
  },
  z.date({ errorMap: () => ({ message: 'Invalid date' }) }),
)

export const ValuationCreateSchema = z.object({
  propertyId: z.string().uuid(),
  valuationDate: dateField,
  valuePence: pence,
  kind: z.enum(VALUATION_KINDS).default('estimate'),
  source: optionalString(200),
  notes: optionalString(2000),
})

export type ValuationCreate = z.infer<typeof ValuationCreateSchema>
