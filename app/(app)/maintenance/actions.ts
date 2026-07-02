// app/(app)/maintenance/actions.ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import {
  ReportJobSchema,
  TriageJobSchema,
  AssignContractorSchema,
  RecordQuoteSchema,
  ScheduleJobSchema,
  CompleteJobSchema,
  AddJobNoteSchema,
  CancelJobSchema,
  RecordInvoiceSchema,
  MarkInvoicePaidSchema,
} from '@/lib/schemas/maintenance'
import type { ActionResult } from '@/lib/types/action-result'

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function ensureContractorOwnership(
  sb: Awaited<ReturnType<typeof supabaseServer>>,
  contractorId: string,
  organisationId: string,
): Promise<string | null> {
  const { data } = await sb
    .from('contractors')
    .select('id')
    .eq('id', contractorId)
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  return data ? null : 'Contractor not found in your organisation.'
}

async function ensureJobOwnership(
  sb: Awaited<ReturnType<typeof supabaseServer>>,
  jobId: string,
  organisationId: string,
): Promise<{ id: string; status: string; property_id: string } | null> {
  const { data } = await sb
    .from('maintenance_jobs')
    .select('id, status, property_id')
    .eq('id', jobId)
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; status: string; property_id: string }>()
  return data
}

async function logEvent(
  sb: Awaited<ReturnType<typeof supabaseServer>>,
  organisationId: string,
  jobId: string,
  actorUserId: string,
  kind: string,
  body: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  // Non-fatal: a logging failure shouldn't roll back the primary
  // action. But surface it to server logs so dropped events aren't
  // silent — the timeline UI is the only audit trail for some of
  // these mutations.
  const { error } = await sb.from('maintenance_job_events').insert({
    organisation_id: organisationId,
    job_id: jobId,
    actor_user_id: actorUserId,
    kind,
    body,
    metadata,
  })
  if (error) {
    console.error('maintenance: logEvent failed', {
      kind,
      jobId,
      err: error.message,
    })
  }
}

export async function reportJob(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ReportJobSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  // Property ownership.
  const { data: prop } = await sb
    .from('properties')
    .select('id')
    .eq('id', parsed.data.propertyId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (!prop) {
    return {
      ok: false,
      error: 'Property not found in your organisation.',
      fieldErrors: { propertyId: ['Not found'] },
    }
  }

  const now = new Date()
  const { data: job, error } = await sb
    .from('maintenance_jobs')
    .insert({
      organisation_id: auth.organisationId,
      property_id: parsed.data.propertyId,
      unit_id: parsed.data.unitId,
      tenancy_id: parsed.data.tenancyId,
      reported_by_user_id: auth.userId,
      kind: parsed.data.kind,
      priority: parsed.data.priority,
      title: parsed.data.title,
      description: parsed.data.description,
      status: 'reported',
      reported_at: now.toISOString(),
      reported_date: toIso(now),
    })
    .select('id')
    .single<{ id: string }>()
  if (error) return { ok: false, error: error.message }
  if (!job) return { ok: false, error: 'no row returned' }

  await logEvent(
    sb,
    auth.organisationId,
    job.id,
    auth.userId,
    'status_change',
    'Reported',
    { status: 'reported' },
  )

  revalidatePath('/maintenance')
  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: { id: job.id } }
}

export async function triageJob(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = TriageJobSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const job = await ensureJobOwnership(sb, parsed.data.jobId, auth.organisationId)
  if (!job) return { ok: false, error: 'Job not found in your organisation.' }

  const update: Record<string, unknown> = {
    status: 'triaged',
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.kind) update['kind'] = parsed.data.kind
  if (parsed.data.priority) update['priority'] = parsed.data.priority

  const { error } = await sb
    .from('maintenance_jobs')
    .update(update)
    .eq('id', parsed.data.jobId)
    .eq('organisation_id', auth.organisationId)
  if (error) return { ok: false, error: error.message }

  await logEvent(
    sb,
    auth.organisationId,
    parsed.data.jobId,
    auth.userId,
    'status_change',
    parsed.data.notes ?? 'Triaged',
    { status: 'triaged', priority: parsed.data.priority, kind: parsed.data.kind },
  )

  revalidatePath('/maintenance')
  revalidatePath(`/maintenance/${parsed.data.jobId}`)
  return { ok: true, data: undefined }
}

export async function assignContractor(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = AssignContractorSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const job = await ensureJobOwnership(sb, parsed.data.jobId, auth.organisationId)
  if (!job) return { ok: false, error: 'Job not found in your organisation.' }
  const ownership = await ensureContractorOwnership(
    sb,
    parsed.data.contractorId,
    auth.organisationId,
  )
  if (ownership) return { ok: false, error: ownership }

  const { error } = await sb
    .from('maintenance_jobs')
    .update({
      assigned_contractor_id: parsed.data.contractorId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.jobId)
    .eq('organisation_id', auth.organisationId)
  if (error) return { ok: false, error: error.message }

  await logEvent(
    sb,
    auth.organisationId,
    parsed.data.jobId,
    auth.userId,
    'contractor_assigned',
    null,
    { contractor_id: parsed.data.contractorId },
  )

  revalidatePath(`/maintenance/${parsed.data.jobId}`)
  return { ok: true, data: undefined }
}

export async function recordQuote(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = RecordQuoteSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const job = await ensureJobOwnership(sb, parsed.data.jobId, auth.organisationId)
  if (!job) return { ok: false, error: 'Job not found in your organisation.' }
  const ownership = await ensureContractorOwnership(
    sb,
    parsed.data.contractorId,
    auth.organisationId,
  )
  if (ownership) return { ok: false, error: ownership }

  const { data: quote, error } = await sb
    .from('maintenance_quotes')
    .insert({
      organisation_id: auth.organisationId,
      job_id: parsed.data.jobId,
      contractor_id: parsed.data.contractorId,
      amount_pence: parsed.data.amountPence.toString(),
      validity_until: parsed.data.validityUntil ? toIso(parsed.data.validityUntil) : null,
      notes: parsed.data.notes,
      source_document_id: parsed.data.sourceDocumentId,
      status: 'pending',
    })
    .select('id')
    .single<{ id: string }>()
  if (error) return { ok: false, error: error.message }
  if (!quote) return { ok: false, error: 'no row returned' }

  // Bump job status if currently in awaiting_quote / reported / triaged.
  if (['reported', 'triaged', 'awaiting_quote'].includes(job.status)) {
    await sb
      .from('maintenance_jobs')
      .update({ status: 'quote_received', updated_at: new Date().toISOString() })
      .eq('id', parsed.data.jobId)
      .eq('organisation_id', auth.organisationId)
  }

  await logEvent(
    sb,
    auth.organisationId,
    parsed.data.jobId,
    auth.userId,
    'quote_received',
    parsed.data.notes ?? null,
    {
      contractor_id: parsed.data.contractorId,
      amount_pence: parsed.data.amountPence.toString(),
      quote_id: quote.id,
    },
  )

  revalidatePath(`/maintenance/${parsed.data.jobId}`)
  return { ok: true, data: { id: quote.id } }
}

export async function acceptQuote(quoteId: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  // Validate the id before sending to the DB so a malformed quoteId
  // gets a clean error instead of a Postgres parse error.
  const parsed = z.string().uuid().safeParse(quoteId)
  if (!parsed.success) {
    return { ok: false, error: 'Invalid quote id.' }
  }
  const id = parsed.data

  const sb = await supabaseServer()

  // Atomically claim the quote: flip pending→accepted in one statement
  // and check we actually moved a row. If two managers race to accept
  // different quotes on the same job, one wins; the other gets a clean
  // "already accepted" error rather than both rows ending up 'accepted'.
  const { data: accepted, error: acceptErr } = await sb
    .from('maintenance_quotes')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .select('id, job_id')
  if (acceptErr) return { ok: false, error: acceptErr.message }
  const acceptedRow = (accepted ?? [])[0] as { id: string; job_id: string } | undefined
  if (!acceptedRow) {
    return {
      ok: false,
      error: 'Quote is no longer pending — refresh and try again.',
    }
  }

  // Decline the other pending quotes on the same job (best-effort; if
  // this fails we still leave the canonical accepted row alone).
  await sb
    .from('maintenance_quotes')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('job_id', acceptedRow.job_id)
    .eq('organisation_id', auth.organisationId)
    .neq('id', acceptedRow.id)
    .eq('status', 'pending')

  await sb
    .from('maintenance_jobs')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', acceptedRow.job_id)
    .eq('organisation_id', auth.organisationId)

  await logEvent(
    sb,
    auth.organisationId,
    acceptedRow.job_id,
    auth.userId,
    'status_change',
    'Quote accepted',
    { quote_id: id, status: 'approved' },
  )

  revalidatePath(`/maintenance/${acceptedRow.job_id}`)
  return { ok: true, data: undefined }
}

export async function scheduleJob(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ScheduleJobSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const job = await ensureJobOwnership(sb, parsed.data.jobId, auth.organisationId)
  if (!job) return { ok: false, error: 'Job not found in your organisation.' }

  const { error } = await sb
    .from('maintenance_jobs')
    .update({
      target_completion_date: toIso(parsed.data.targetDate),
      status: 'scheduled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.jobId)
    .eq('organisation_id', auth.organisationId)
  if (error) return { ok: false, error: error.message }

  await logEvent(
    sb,
    auth.organisationId,
    parsed.data.jobId,
    auth.userId,
    'status_change',
    `Scheduled for ${toIso(parsed.data.targetDate)}`,
    { status: 'scheduled', target_completion_date: toIso(parsed.data.targetDate) },
  )

  revalidatePath(`/maintenance/${parsed.data.jobId}`)
  return { ok: true, data: undefined }
}

export async function completeJob(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = CompleteJobSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const job = await ensureJobOwnership(sb, parsed.data.jobId, auth.organisationId)
  if (!job) return { ok: false, error: 'Job not found in your organisation.' }

  const { error } = await sb
    .from('maintenance_jobs')
    .update({
      status: 'completed',
      completed_at: parsed.data.completedAt.toISOString(),
      completed_date: toIso(parsed.data.completedAt),
      cost_pence: parsed.data.finalCostPence.toString(),
      cost_actual_pence: parsed.data.finalCostPence.toString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.jobId)
    .eq('organisation_id', auth.organisationId)
  if (error) return { ok: false, error: error.message }

  await logEvent(
    sb,
    auth.organisationId,
    parsed.data.jobId,
    auth.userId,
    'status_change',
    'Completed',
    { status: 'completed', cost_pence: parsed.data.finalCostPence.toString() },
  )

  revalidatePath('/maintenance')
  revalidatePath(`/maintenance/${parsed.data.jobId}`)
  revalidatePath(`/properties/${job.property_id}`)
  return { ok: true, data: undefined }
}

export async function addJobNote(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = AddJobNoteSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const job = await ensureJobOwnership(sb, parsed.data.jobId, auth.organisationId)
  if (!job) return { ok: false, error: 'Job not found in your organisation.' }

  await logEvent(
    sb,
    auth.organisationId,
    parsed.data.jobId,
    auth.userId,
    'note_added',
    parsed.data.body,
  )
  revalidatePath(`/maintenance/${parsed.data.jobId}`)
  return { ok: true, data: undefined }
}

export async function cancelJob(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = CancelJobSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const job = await ensureJobOwnership(sb, parsed.data.jobId, auth.organisationId)
  if (!job) return { ok: false, error: 'Job not found in your organisation.' }

  const { error } = await sb
    .from('maintenance_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.jobId)
    .eq('organisation_id', auth.organisationId)
  if (error) return { ok: false, error: error.message }

  await logEvent(
    sb,
    auth.organisationId,
    parsed.data.jobId,
    auth.userId,
    'status_change',
    `Cancelled — ${parsed.data.reason}`,
    { status: 'cancelled' },
  )

  revalidatePath(`/maintenance/${parsed.data.jobId}`)
  return { ok: true, data: undefined }
}

export async function recordInvoice(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = RecordInvoiceSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const job = await ensureJobOwnership(sb, parsed.data.jobId, auth.organisationId)
  if (!job) return { ok: false, error: 'Job not found in your organisation.' }
  const ownership = await ensureContractorOwnership(
    sb,
    parsed.data.contractorId,
    auth.organisationId,
  )
  if (ownership) return { ok: false, error: ownership }

  const { data: invoice, error } = await sb
    .from('maintenance_invoices')
    .insert({
      organisation_id: auth.organisationId,
      job_id: parsed.data.jobId,
      contractor_id: parsed.data.contractorId,
      amount_pence: parsed.data.amountPence.toString(),
      vat_pence: parsed.data.vatPence.toString(),
      invoice_number: parsed.data.invoiceNumber,
      invoice_date: toIso(parsed.data.invoiceDate),
      source_document_id: parsed.data.sourceDocumentId,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        error:
          'Invoice number already exists for this contractor. Duplicate invoice?',
        fieldErrors: { invoiceNumber: ['Duplicate'] },
      }
    }
    return { ok: false, error: error.message }
  }
  if (!invoice) return { ok: false, error: 'no row returned' }

  // Only move forward into 'awaiting_invoice' from a workflow state
  // that actually precedes it. Recording an invoice on a job that's
  // already 'completed' / 'cancelled' / 'awaiting_invoice' should not
  // regress the job. Earlier states (reported / triaged) shouldn't
  // jump straight here either — leave them so the user notices the
  // workflow inversion. RLS plus the org filter protects cross-org.
  await sb
    .from('maintenance_jobs')
    .update({ status: 'awaiting_invoice', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.jobId)
    .eq('organisation_id', auth.organisationId)
    .in('status', ['approved', 'scheduled', 'in_progress'])

  await logEvent(
    sb,
    auth.organisationId,
    parsed.data.jobId,
    auth.userId,
    'invoice_received',
    null,
    {
      invoice_id: invoice.id,
      amount_pence: parsed.data.amountPence.toString(),
      vat_pence: parsed.data.vatPence.toString(),
      invoice_number: parsed.data.invoiceNumber,
    },
  )

  revalidatePath(`/maintenance/${parsed.data.jobId}`)
  return { ok: true, data: { id: invoice.id } }
}

export async function markInvoicePaid(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = MarkInvoicePaidSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  // Ownership of the invoice; pull job_id for revalidation + event log.
  const { data: invoice } = await sb
    .from('maintenance_invoices')
    .select('id, job_id')
    .eq('id', parsed.data.invoiceId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; job_id: string }>()
  if (!invoice) return { ok: false, error: 'Invoice not found.' }

  // If a transactionId was supplied, verify it belongs to this org.
  if (parsed.data.transactionId) {
    const { data: tx } = await sb
      .from('transactions')
      .select('id')
      .eq('id', parsed.data.transactionId)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string }>()
    if (!tx) return { ok: false, error: 'Transaction not found in your organisation.' }
  }

  const { error } = await sb
    .from('maintenance_invoices')
    .update({
      paid_at: parsed.data.paidAt.toISOString(),
      transaction_id: parsed.data.transactionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.invoiceId)
    .eq('organisation_id', auth.organisationId)
  if (error) return { ok: false, error: error.message }

  await logEvent(
    sb,
    auth.organisationId,
    invoice.job_id,
    auth.userId,
    'note_added',
    `Invoice marked paid${parsed.data.transactionId ? ` (txn ${parsed.data.transactionId})` : ''}`,
    { invoice_id: parsed.data.invoiceId, transaction_id: parsed.data.transactionId },
  )

  revalidatePath(`/maintenance/${invoice.job_id}`)
  return { ok: true, data: undefined }
}
