// lib/schemas/unit.ts
// Zod schemas for the Unit resource — a property's room/flat.

import { z } from 'zod'

export const UNIT_STATUSES = ['vacant', 'occupied', 'reserved', 'maintenance', 'offline'] as const
export type UnitStatus = (typeof UNIT_STATUSES)[number]

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

const optionalDecimal = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const n = Number(v.replace(/[,\s]/g, ''))
      return Number.isFinite(n) ? n : v
    }
    return v
  },
  z.number().min(0).max(10_000).nullable(),
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
      if (!Number.isFinite(n)) return v
      return BigInt(Math.round(n * 100))
    }
    return v
  },
  z.bigint().nonnegative().nullable(),
)

const optionalInt = (min = 0, max = 100) =>
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

const flag = z.preprocess(
  (v) => (v === null || v === undefined ? false : v),
  z.coerce.boolean(),
)

export const UnitCreateSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(60),
  bedrooms: z.preprocess(
    (v) => {
      if (v === null || v === undefined || v === '') return 1
      if (typeof v === 'string') {
        const n = Number(v)
        return Number.isFinite(n) ? Math.round(n) : v
      }
      return v
    },
    z.number().int().min(0).max(20),
  ),
  bathroomsEnsuite: flag,
  floorAreaSqm: optionalDecimal,
  marketRentPence: optionalPence,
  status: z.enum(UNIT_STATUSES).default('vacant'),
  notes: optionalString(2000),
})

export const UnitUpdateSchema = UnitCreateSchema
export type UnitCreate = z.infer<typeof UnitCreateSchema>
export type UnitUpdate = z.infer<typeof UnitUpdateSchema>
