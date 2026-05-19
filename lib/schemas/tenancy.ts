// lib/schemas/tenancy.ts
// Zod schemas for Tenancy lifecycle: create, update, give-notice, end,
// record-rent-change. Shared by form + server action.

import { z } from 'zod'
import { pencePreprocessor, optionalPencePreprocessor } from '@/lib/money'
import { TenantCreateSchema } from './tenant'

export const TENANCY_KINDS = [
  'ast',
  'licence',
  'aasc_placement',
  'company_let',
  'holiday_let',
] as const
export type TenancyKind = (typeof TENANCY_KINDS)[number]

export const RENT_PERIODS = ['weekly', 'four_weekly', 'monthly', 'annual'] as const
export type RentPeriod = (typeof RENT_PERIODS)[number]

export const DEPOSIT_SCHEMES = ['dps', 'mydeposits', 'tds', 'none'] as const
export type DepositScheme = (typeof DEPOSIT_SCHEMES)[number]

export const TENANCY_STATUSES = ['active', 'notice_given', 'ended'] as const
export type TenancyStatus = (typeof TENANCY_STATUSES)[number]

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
  pencePreprocessor,
  z.bigint().nonnegative('Must be a non-negative amount in £'),
)

const optionalPence = z.preprocess(
  optionalPencePreprocessor,
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

const optionalScheme = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? null : v),
  z.enum(DEPOSIT_SCHEMES).nullable(),
)

// CreateTenancy supports nested tenant creation for AST/licence kinds.
// AASC placements are created from the M8 flow, not this form — but the
// schema still accepts the kind so server-side validation matches the
// stored values.
export const TenancyCreateSchema = z
  .object({
    propertyId: z.string().uuid('Choose a property'),
    unitId: z.string().uuid().nullish().transform((v) => v ?? null),

    kind: z.enum(TENANCY_KINDS).default('ast'),

    startDate: dateField,
    endDateIntended: optionalDate,

    rentPence: pence,
    rentPeriod: z.enum(RENT_PERIODS).default('monthly'),
    depositPence: optionalPence,
    depositScheme: optionalScheme,
    depositSchemeRef: optionalString(100),

    aascPlacementRef: optionalString(100),
    aascContractor: z.preprocess(
      (v) => (v === null || v === undefined || v === '' ? null : v),
      z.enum(['clearsprings', 'serco']).nullable(),
    ),

    notes: optionalString(2000),

    // Inline tenant creation (AST/licence/company_let only). The form
    // supports up to 4 joint tenants; the first is stored as the lead
    // `tenancy.tenant_id`, the rest go into `tenancy_tenants`.
    tenants: z.array(TenantCreateSchema).max(4).default([]),
  })
  .refine(
    (v) => v.kind !== 'aasc_placement' || v.tenants.length === 0,
    {
      message: 'AASC placements must not carry tenant identity data',
      path: ['tenants'],
    },
  )
  .refine(
    (v) => v.kind === 'aasc_placement' || v.kind === 'holiday_let' || v.tenants.length >= 1,
    {
      message: 'At least one tenant is required',
      path: ['tenants'],
    },
  )

export const TenancyUpdateSchema = TenancyCreateSchema.innerType().innerType().omit({
  tenants: true,
})

export type TenancyCreate = z.infer<typeof TenancyCreateSchema>
export type TenancyUpdate = z.infer<typeof TenancyUpdateSchema>

export const GiveNoticeSchema = z.object({
  tenancyId: z.string().uuid(),
  noticeGivenAt: dateField,
  vacateDate: dateField,
})

export const EndTenancySchema = z.object({
  tenancyId: z.string().uuid(),
  endDate: dateField,
  reason: z.enum(['notice_period_expired', 'mutual_break', 'eviction', 'other']).default('notice_period_expired'),
  notes: optionalString(2000),
})

export const RentChangeSchema = z.object({
  tenancyId: z.string().uuid(),
  effectiveFrom: dateField,
  newRentPence: pence,
  newRentPeriod: z.enum(RENT_PERIODS),
  reason: z.enum(['review', 'regeared', 'arrears_negotiation', 'adjustment']).default('review'),
  notes: optionalString(2000),
})

export type GiveNoticeInput = z.infer<typeof GiveNoticeSchema>
export type EndTenancyInput = z.infer<typeof EndTenancySchema>
export type RentChangeInput = z.infer<typeof RentChangeSchema>
