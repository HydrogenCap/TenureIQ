// lib/schemas/shareholder.ts
// Companies-House-style shareholder roster on an Entity. Distinct from
// investor_capital_accounts (which is the HydrogenCap distribution
// ledger surfaced in M11) — shareholders are the legal owners.

import { z } from 'zod'

export const SHARE_CLASSES = ['ordinary', 'preference', 'a_ordinary', 'b_ordinary', 'other'] as const
export type ShareClass = (typeof SHARE_CLASSES)[number]

const optionalDate = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === '') return null
    if (v instanceof Date) return v
    if (typeof v === 'string') return new Date(v)
    return v
  },
  z.date().nullable(),
)

export const ShareholderCreateSchema = z.object({
  entityId: z.string().uuid('Choose an entity'),
  name: z.string().trim().min(1, 'Name is required').max(200),
  shareCount: z.coerce.number().int().min(0, 'Share count must be ≥ 0').max(1_000_000_000),
  shareClass: z.enum(SHARE_CLASSES).default('ordinary'),
  isDirector: z.preprocess((v) => (v === 'on' || v === true ? true : v === false || v === undefined || v === null ? false : v), z.boolean()),
  appointedDate: optionalDate,
  resignedDate: optionalDate,
})

export const ShareholderUpdateSchema = ShareholderCreateSchema.omit({ entityId: true })

export type ShareholderCreate = z.infer<typeof ShareholderCreateSchema>
export type ShareholderUpdate = z.infer<typeof ShareholderUpdateSchema>
