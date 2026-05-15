// lib/schemas/tenant.ts
// Zod schemas for the Tenant resource — identity record for AST/licence
// tenants. NOT used for AASC placements (per convention #13).

import { z } from 'zod'

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

const optionalEmail = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') {
      const trimmed = v.trim()
      return trimmed.length === 0 ? null : trimmed
    }
    return v
  },
  z.string().email('Invalid email address').nullable(),
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

export const TenantCreateSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: optionalEmail,
  phone: optionalString(40),
  rightToRentChecked: z.preprocess(
    (v) => (v === null || v === undefined ? false : v),
    z.coerce.boolean(),
  ),
  rightToRentExpiry: optionalDate,
  notes: optionalString(2000),
})

export const TenantUpdateSchema = TenantCreateSchema
export type TenantCreate = z.infer<typeof TenantCreateSchema>
export type TenantUpdate = z.infer<typeof TenantUpdateSchema>
