// lib/schemas/aasc.ts
// AASC contract + placement schemas. Hard rule: placement schemas
// must NOT contain any service-user identity fields. The SQL guard
// catches it at the column level; this is the JS-side mirror.

import { z } from 'zod'
import { pencePreprocessor, optionalPencePreprocessor } from '@/lib/money'

export const AASC_CONTRACTORS = ['clearsprings', 'serco'] as const
export type AascContractor = (typeof AASC_CONTRACTORS)[number]

export const AASC_CONTRACT_KINDS = ['direct_lease', 'supply_agreement'] as const
export type AascContractKind = (typeof AASC_CONTRACT_KINDS)[number]

export const AASC_CONTRACT_STATUSES = ['active', 'expired', 'suspended', 'terminated'] as const
export type AascContractStatus = (typeof AASC_CONTRACT_STATUSES)[number]

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

const pence = z.preprocess(pencePreprocessor, z.bigint().nonnegative())

const optionalPence = z.preprocess(
  optionalPencePreprocessor,
  z.bigint().nonnegative().nullable(),
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

// Basis-points input from a percent decimal (e.g. "12.5" → 1250).
// Mirrors lib/schemas/mortgage.ts bps but without the off-by-99 trap —
// we always multiply by 100.
const bps = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === '') return 0
    if (typeof v === 'number') return Math.round(v * 100)
    if (typeof v === 'string') {
      const cleaned = v.replace(/[%\s]/g, '')
      const n = Number(cleaned)
      return Number.isFinite(n) ? Math.round(n * 100) : v
    }
    return v
  },
  z.number().int().min(0).max(10_000),
)

const optionalBps = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'number') return Math.round(v * 100)
    if (typeof v === 'string') {
      const cleaned = v.replace(/[%\s]/g, '')
      const n = Number(cleaned)
      return Number.isFinite(n) ? Math.round(n * 100) : v
    }
    return v
  },
  z.number().int().min(0).max(10_000).nullable(),
)

const optionalUuid = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? null : v),
  z.string().uuid().nullable(),
)

export const AascContractCreateSchema = z.object({
  entityId: optionalUuid,
  contractor: z.enum(AASC_CONTRACTORS),
  kind: z.enum(AASC_CONTRACT_KINDS).default('direct_lease'),
  reference: optionalString(120),
  startDate: dateField,
  endDate: optionalDate,
  breakClauseDate: optionalDate,
  contractedRatePencePerWeek: optionalPence,
  commissionRateBps: bps.default(0),
  paymentTermsDays: z.coerce.number().int().min(0).max(180).default(30),
  payableBankAccountId: optionalUuid,
  monthlyHeadlinePence: optionalPence,
  notes: optionalString(2000),
})
export type AascContractCreate = z.infer<typeof AascContractCreateSchema>

export const AascContractUpdateSchema = AascContractCreateSchema

// Placement schema — explicitly does NOT accept identity fields. Even
// passing them would be silently ignored, but we add a refine that
// rejects unknown keys as a belt-and-braces sanity check.
const ForbiddenPlacementKeys = [
  'name', 'fullName', 'firstName', 'lastName',
  'dob', 'dateOfBirth', 'nationality',
  'passport', 'passportNumber', 'nationalId',
  'homeOfficeReference', 'asylumReference',
] as const

export const AascPlacementCreateSchema = z
  .object({
    contractId: z.string().uuid('Choose a contract'),
    propertyId: z.string().uuid('Choose a property'),
    unitId: optionalUuid,
    placementRef: z.string().trim().min(1, 'Reference required').max(120),
    weeklyRatePence: pence,
    commissionRateBpsOverride: optionalBps,
    serviceUserCount: z.coerce.number().int().min(1).max(50).default(1),
    startDate: dateField,
    endDateExpected: optionalDate,
  })
  // `.strict()` rejects ANY unknown key on the input. Combined with the
  // explicit forbidden-key check in the superRefine, a client posting
  // e.g. { firstName: '…' } gets two errors: one for the unknown key
  // and one naming the forbidden field specifically. Without .strict(),
  // Zod's default behaviour silently strips unknown keys *before* the
  // superRefine runs — so the security-reviewer correctly flagged the
  // old code as a no-op.
  .strict()
  .superRefine((val, ctx) => {
    const keys = Object.keys(val as object)
    for (const forbidden of ForbiddenPlacementKeys) {
      if (keys.includes(forbidden)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [forbidden],
          message: 'Service-user identity fields are forbidden on placements',
        })
      }
    }
  })
export type AascPlacementCreate = z.infer<typeof AascPlacementCreateSchema>

export const EndPlacementSchema = z.object({
  placementId: z.string().uuid(),
  endDateActual: dateField,
  reason: z.enum(['ended_natural', 'terminated_provider', 'terminated_landlord', 'other']).default('ended_natural'),
  notes: optionalString(2000),
})
export type EndPlacementInput = z.infer<typeof EndPlacementSchema>

export const UpdateServiceUserCountSchema = z.object({
  placementId: z.string().uuid(),
  newCount: z.coerce.number().int().min(0).max(50),
  effectiveFrom: dateField,
  reason: optionalString(500),
})
export type UpdateServiceUserCountInput = z.infer<typeof UpdateServiceUserCountSchema>
