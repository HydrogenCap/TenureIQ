// lib/schemas/maintenance.ts
// Shared schemas for the contractor + job + quote + invoice surfaces.

import { z } from 'zod'
import { pencePreprocessor } from '@/lib/money'

export const CONTRACTOR_KINDS = [
  'plumber','electrician','gas_safe','locksmith','cleaner',
  'gardener','handyman','roofer','damp_specialist','pest_control',
  'fire_safety','epc_assessor','general','other',
] as const
export type ContractorKind = (typeof CONTRACTOR_KINDS)[number]

export const JOB_KINDS = [
  'repair','planned_maintenance','inspection','cleaning','statutory','emergency',
] as const
export type JobKind = (typeof JOB_KINDS)[number]

export const JOB_PRIORITIES = ['emergency','urgent','normal','low'] as const
export type JobPriority = (typeof JOB_PRIORITIES)[number]

export const JOB_STATUSES = [
  'reported','triaged','awaiting_quote','quote_received','approved',
  'scheduled','in_progress','awaiting_invoice','completed','cancelled',
] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

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

const optionalEmail = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') {
      const t = v.trim()
      return t.length === 0 ? null : t
    }
    return v
  },
  z.string().email().nullable(),
)

const pence = z.preprocess(pencePreprocessor, z.bigint().nonnegative())

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

const optionalUuid = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? null : v),
  z.string().uuid().nullable(),
)

// Accreditations come from a comma-separated text input. Normalise to
// trimmed unique tokens.
const accreditations = z.preprocess(
  (v) => {
    if (Array.isArray(v)) {
      return Array.from(new Set(v.map((x) => String(x).trim()).filter((x) => x.length > 0)))
    }
    if (typeof v === 'string') {
      return Array.from(
        new Set(v.split(/[,;]\s*/).map((s) => s.trim()).filter((s) => s.length > 0)),
      )
    }
    return []
  },
  z.array(z.string().min(1).max(60)).max(20),
)

export const ContractorCreateSchema = z.object({
  entityId: optionalUuid,
  name: z.string().trim().min(1, 'Name is required').max(200),
  kind: z.enum(CONTRACTOR_KINDS),
  contactName: optionalString(120),
  phone: optionalString(40),
  email: optionalEmail,
  insuranceExpiry: optionalDate,
  accreditations: accreditations.default([]),
  notes: optionalString(2000),
})
export type ContractorCreate = z.infer<typeof ContractorCreateSchema>

export const ReportJobSchema = z.object({
  propertyId: z.string().uuid('Choose a property'),
  unitId: optionalUuid,
  tenancyId: optionalUuid,
  kind: z.enum(JOB_KINDS).default('repair'),
  priority: z.enum(JOB_PRIORITIES).default('normal'),
  title: z.string().trim().min(3, 'A short title helps triage').max(200),
  description: optionalString(5000),
})
export type ReportJobInput = z.infer<typeof ReportJobSchema>

export const TriageJobSchema = z.object({
  jobId: z.string().uuid(),
  kind: z.enum(JOB_KINDS).optional(),
  priority: z.enum(JOB_PRIORITIES).optional(),
  notes: optionalString(2000),
})
export type TriageJobInput = z.infer<typeof TriageJobSchema>

export const AssignContractorSchema = z.object({
  jobId: z.string().uuid(),
  contractorId: z.string().uuid(),
})
export type AssignContractorInput = z.infer<typeof AssignContractorSchema>

export const RecordQuoteSchema = z.object({
  jobId: z.string().uuid(),
  contractorId: z.string().uuid(),
  amountPence: pence,
  validityUntil: optionalDate,
  notes: optionalString(2000),
  sourceDocumentId: optionalUuid,
})
export type RecordQuoteInput = z.infer<typeof RecordQuoteSchema>

export const ScheduleJobSchema = z.object({
  jobId: z.string().uuid(),
  targetDate: dateField,
})
export type ScheduleJobInput = z.infer<typeof ScheduleJobSchema>

export const CompleteJobSchema = z.object({
  jobId: z.string().uuid(),
  completedAt: dateField,
  finalCostPence: pence,
})
export type CompleteJobInput = z.infer<typeof CompleteJobSchema>

export const AddJobNoteSchema = z.object({
  jobId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
})
export type AddJobNoteInput = z.infer<typeof AddJobNoteSchema>

export const CancelJobSchema = z.object({
  jobId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})
export type CancelJobInput = z.infer<typeof CancelJobSchema>

export const RecordInvoiceSchema = z.object({
  jobId: z.string().uuid(),
  contractorId: z.string().uuid(),
  amountPence: pence,
  vatPence: pence.default(0n),
  invoiceNumber: z.string().trim().min(1).max(60),
  invoiceDate: dateField,
  sourceDocumentId: optionalUuid,
})
export type RecordInvoiceInput = z.infer<typeof RecordInvoiceSchema>

export const MarkInvoicePaidSchema = z.object({
  invoiceId: z.string().uuid(),
  paidAt: dateField,
  transactionId: optionalUuid,
})
export type MarkInvoicePaidInput = z.infer<typeof MarkInvoicePaidSchema>
