// lib/schemas/entity.ts
// Shared Zod schemas for the Entity resource. Imported by:
//   - app/(app)/entities/_components/entity-form.tsx (RHF resolver)
//   - app/(app)/entities/actions.ts (server-side validation)

import { z } from 'zod'

export const ENTITY_KINDS = ['ltd', 'llp', 'individual', 'spv'] as const
export type EntityKind = (typeof ENTITY_KINDS)[number]

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

const companyNumber = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') {
      const trimmed = v.trim()
      return trimmed.length === 0 ? null : trimmed.toUpperCase()
    }
    return v
  },
  z
    .string()
    .regex(/^[A-Z0-9]{6,10}$/, 'Must be 6–10 alphanumeric characters')
    .nullable(),
)

const utr = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') {
      const trimmed = v.trim()
      return trimmed.length === 0 ? null : trimmed
    }
    return v
  },
  z.string().regex(/^\d{10}$/, 'UTR must be 10 digits').nullable(),
)

const optionalInt = (min: number, max: number) =>
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

export const EntityCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    kind: z.enum(ENTITY_KINDS),
    companiesHouseNumber: companyNumber,
    registeredAddress: optionalString(500),
    hmrcUtr: utr,
    vatNumber: optionalString(20),
    yearEndMonth: optionalInt(1, 12),
    yearEndDay: optionalInt(1, 31),
    notes: optionalString(2000),
  })
  .refine(
    (v) => v.kind !== 'individual' || v.companiesHouseNumber === null,
    {
      message: 'Companies House number is not applicable to individuals',
      path: ['companiesHouseNumber'],
    },
  )
  .refine(
    (v) =>
      (v.yearEndMonth === null && v.yearEndDay === null) ||
      (v.yearEndMonth !== null && v.yearEndDay !== null),
    { message: 'Year-end month and day must be set together', path: ['yearEndDay'] },
  )

export const EntityUpdateSchema = EntityCreateSchema
export type EntityCreate = z.infer<typeof EntityCreateSchema>
export type EntityUpdate = z.infer<typeof EntityUpdateSchema>
