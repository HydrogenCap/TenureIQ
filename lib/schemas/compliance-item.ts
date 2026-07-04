// lib/schemas/compliance-item.ts
// Shared schemas for the Compliance Item resource. Imported by:
//   - app/(app)/compliance/_components/compliance-item-form.tsx
//   - app/(app)/compliance/actions.ts
//
// Compliance "kinds" cover gas safety, EICR, EPC and the rest of the
// statutory + recommended certs that landlords manage. The list mirrors
// the M6 prompt's enum.

import { z } from 'zod'

export const COMPLIANCE_KINDS = [
  'gas_safety',
  'eicr',
  'epc',
  'pat',
  'hmo_licence',
  'fire_risk_assessment',
  'emergency_lighting',
  'fire_alarm_test',
  'fire_alarm',
  'legionella',
  'asbestos_survey',
  'asbestos',
  'oil_safety',
  'co_alarm',
  'smoke_alarm',
  'deposit_protection',
  'right_to_rent',
  'insurance',
  'other',
] as const
export type ComplianceKind = (typeof COMPLIANCE_KINDS)[number]

export const COMPLIANCE_STATUSES = [
  'valid',
  'expiring',
  'expired',
  'missing',
  'exempt',
] as const
export type ComplianceItemStatus = (typeof COMPLIANCE_STATUSES)[number]

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

const optionalDate = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === '') return null
    if (v instanceof Date) return v
    if (typeof v === 'string') return new Date(v)
    return v
  },
  z.date().nullable(),
)

export const ComplianceItemCreateSchema = z
  .object({
    propertyId: z.string().uuid('Choose a property'),
    unitId: z.string().uuid().nullish().transform((v) => v ?? null),

    kind: z.enum(COMPLIANCE_KINDS),
    issueDate: optionalDate,
    expiryDate: optionalDate,
    issuer: optionalString(200),
    documentId: z.string().uuid().nullish().transform((v) => v ?? null),
    notes: optionalString(2000),
  })
  .refine(
    (v) =>
      v.issueDate === null ||
      v.expiryDate === null ||
      v.issueDate.getTime() <= v.expiryDate.getTime(),
    { message: 'Issue date must be on or before expiry date', path: ['expiryDate'] },
  )

export const ComplianceItemUpdateSchema = ComplianceItemCreateSchema

export type ComplianceItemCreate = z.infer<typeof ComplianceItemCreateSchema>
export type ComplianceItemUpdate = z.infer<typeof ComplianceItemUpdateSchema>

export const MarkExemptSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.string().trim().min(1, 'Reason is required').max(2000),
})
export type MarkExemptInput = z.infer<typeof MarkExemptSchema>

// Bulk variant for the list-page selection bar. 200 caps the URL-encoded
// action payload and one UPDATE round-trip at something sane.
export const BulkMarkExemptSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(200),
  reason: z.string().trim().min(3, 'Give a short reason').max(500),
})

export type BulkMarkExemptInput = z.infer<typeof BulkMarkExemptSchema>
