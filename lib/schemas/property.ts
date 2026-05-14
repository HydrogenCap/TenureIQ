// lib/schemas/property.ts
// Shared Zod schemas for the Property resource. Imported by:
//   - app/(app)/properties/_components/property-form.tsx (RHF resolver)
//   - app/(app)/properties/actions.ts (server-side validation)
//   - app/(app)/properties/import/_components/import-wizard.tsx (CSV row mapping)
//   - app/(app)/properties/import/actions.ts (commit validation)

import { z } from 'zod'

export const PROPERTY_KINDS = [
  'hmo',
  'single_let',
  'block',
  'commercial',
  'development',
  'land',
] as const
export type PropertyKind = (typeof PROPERTY_KINDS)[number]

export const HMO_LICENCE_KINDS = ['none', 'mandatory', 'additional', 'selective'] as const
export type HmoLicenceKind = (typeof HMO_LICENCE_KINDS)[number]

export const EPC_RATINGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
export type EpcRating = (typeof EPC_RATINGS)[number]

// UK postcode — case-insensitive, with optional space.
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i

// String field that can be missing/empty in source but is always present as
// either a trimmed string or `null` in the output. Required-but-nullable.
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

// Required-nullable integer.
const optionalInt = (min = 0, max = 1_000_000) =>
  z.preprocess(
    (v) => {
      if (v === null || v === undefined || v === '') return null
      if (typeof v === 'string') {
        const n = Number(v)
        return Number.isFinite(n) ? Math.round(n) : v
      }
      if (typeof v === 'number') return Math.round(v)
      return v
    },
    z.number().int().min(min).max(max).nullable(),
  )

// Required pence value (bigint). Accepts £/comma/number input.
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
  z.bigint().nonnegative('Must be a non-negative amount in £'),
)

// Optional pence (null-or-bigint). Empty / missing → null.
const optionalPence = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'bigint') return v
    if (typeof v === 'number') return BigInt(Math.round(v * 100))
    if (typeof v === 'string') {
      const cleaned = v.replace(/[£,\s]/g, '')
      if (cleaned === '') return null
      const n = Number(cleaned)
      if (!Number.isFinite(n)) return v
      return BigInt(Math.round(n * 100))
    }
    return v
  },
  z.bigint().nonnegative().nullable(),
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

const postcode = z
  .string()
  .trim()
  .regex(UK_POSTCODE, 'Invalid UK postcode')
  .transform((v) => {
    const upper = v.toUpperCase().replace(/\s+/g, '')
    return `${upper.slice(0, upper.length - 3)} ${upper.slice(-3)}`
  })

export const PropertyCreateSchema = z.object({
  entityId: z.string().uuid('Choose an entity'),

  addressLine1: z.string().trim().min(1, 'Address is required').max(200),
  addressLine2: optionalString(200),
  city: z.string().trim().min(1, 'City is required').max(100),
  county: optionalString(100),
  postcode,
  localAuthority: optionalString(100),
  brmaCode: optionalString(20),

  kind: z.enum(PROPERTY_KINDS),
  classUse: optionalString(40),
  bedroomsTotal: optionalInt(0, 50),
  bathroomsTotal: optionalInt(0, 50),

  purchasePricePence: pence,
  purchaseDate: dateField,
  sdltPaidPence: optionalPence,
  refurbCostPence: optionalPence,
  acquisitionCostsPence: optionalPence,

  epcRating: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.enum(EPC_RATINGS).nullable(),
  ),
  epcExpiry: optionalDate,

  hmoLicenceKind: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? 'none' : v),
    z.enum(HMO_LICENCE_KINDS),
  ),
  hmoLicenceRef: optionalString(100),
  hmoLicenceExpiry: optionalDate,
  hmoPermittedOccupancy: optionalInt(0, 100),

  article4Area: z.preprocess(
    (v) => (v === null || v === undefined ? false : v),
    z.coerce.boolean(),
  ),
  isAascProperty: z.preprocess(
    (v) => (v === null || v === undefined ? false : v),
    z.coerce.boolean(),
  ),

  notes: optionalString(2000),
})

export const PropertyUpdateSchema = PropertyCreateSchema
export type PropertyCreate = z.infer<typeof PropertyCreateSchema>
export type PropertyUpdate = z.infer<typeof PropertyUpdateSchema>

export const SetCurrentValuationSchema = z.object({
  propertyId: z.string().uuid(),
  valuationPence: pence,
  asOf: dateField,
  source: z.string().trim().min(1).max(200),
  kind: z
    .enum(['estimate', 'estate_agent', 'red_book', 'refinance', 'purchase', 'desktop'])
    .default('estimate'),
  notes: optionalString(2000),
})
export type SetCurrentValuationInput = z.infer<typeof SetCurrentValuationSchema>
