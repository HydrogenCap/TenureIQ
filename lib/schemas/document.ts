// lib/schemas/document.ts
// Document-resource schemas. The kinds enum overlaps compliance kinds
// (so OCR-extracted certs auto-link) plus the non-compliance kinds that
// landlords commonly file.

import { z } from 'zod'

export const DOCUMENT_KINDS = [
  // Compliance-mappable
  'gas_safety',
  'eicr',
  'epc',
  'pat',
  'hmo_licence',
  'fire_risk_assessment',
  'fire_alarm_test',
  'fire_alarm',
  'emergency_lighting',
  'legionella',
  'asbestos_survey',
  'oil_safety',
  'co_alarm',
  'smoke_alarm',
  'deposit_protection',
  'right_to_rent',
  // Non-compliance
  'tenancy_agreement',
  'tenancy_addendum',
  'invoice',
  'quote',
  'inspection_report',
  'lease',
  'lender_offer',
  'mortgage_statement',
  'valuation_report',
  'letter',
  'other',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

// Compliance kinds that have an extractor — the upload flow surfaces a
// "Run OCR" / "Confirm extracted fields" path for these.
export const COMPLIANCE_DOCUMENT_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>([
  'gas_safety',
  'eicr',
  'epc',
  'pat',
  'hmo_licence',
  'fire_risk_assessment',
  'fire_alarm_test',
  'fire_alarm',
  'emergency_lighting',
  'legionella',
  'asbestos_survey',
  'oil_safety',
  'co_alarm',
  'smoke_alarm',
  'deposit_protection',
  'right_to_rent',
])

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
])

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

const optionalUuid = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? null : v),
  z.string().uuid().nullable(),
)

export const DocumentCreateSchema = z
  .object({
    propertyId: optionalUuid,
    unitId: optionalUuid,
    tenancyId: optionalUuid,
    mortgageId: optionalUuid,
    kind: z.enum(DOCUMENT_KINDS).nullish().transform((v) => v ?? null),
    filename: z.string().trim().min(1).max(255),
    mimeType: z
      .string()
      .refine((m) => ALLOWED_MIME.has(m), {
        message: 'Unsupported file type — PDF, JPEG, PNG, HEIC, or WebP only',
      }),
    sizeBytes: z.coerce
      .number()
      .int()
      .min(1)
      .max(50 * 1024 * 1024, 'File exceeds 50MB limit'),
  })
  .refine(
    (v) =>
      // At least one parent linkage. Documents may be entity-level (no
      // property) but must attach to a property/unit/tenancy/mortgage at
      // minimum — otherwise the user can't filter to find them.
      v.propertyId !== null ||
      v.unitId !== null ||
      v.tenancyId !== null ||
      v.mortgageId !== null,
    {
      message: 'Link the document to a property, unit, tenancy, or mortgage.',
      path: ['propertyId'],
    },
  )

export type DocumentCreate = z.infer<typeof DocumentCreateSchema>

export const ConfirmExtractionSchema = z.object({
  documentId: z.string().uuid(),
  kind: z.enum(DOCUMENT_KINDS),
  issueDate: z.preprocess(
    (v) => (v === null || v === undefined || v === '' ? null : v),
    z.coerce.date().nullable(),
  ),
  expiryDate: z.preprocess(
    (v) => (v === null || v === undefined || v === '' ? null : v),
    z.coerce.date().nullable(),
  ),
  issuer: optionalString(200),
  notes: optionalString(2000),
})
export type ConfirmExtractionInput = z.infer<typeof ConfirmExtractionSchema>
