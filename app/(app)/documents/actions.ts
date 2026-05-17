// app/(app)/documents/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import {
  ConfirmExtractionSchema,
  COMPLIANCE_DOCUMENT_KINDS,
  type DocumentKind,
} from '@/lib/schemas/document'
import type { ActionResult } from '@/lib/types/action-result'

// Document upload happens client-side via supabase.storage upload, then
// the client calls this action with the storage path + metadata.
// Doing storage in-action would need the file bytes traversing the
// server-action boundary as a FormData — works but slower.
export async function registerDocument(input: {
  storagePath: string
  filename: string
  mimeType: string
  sizeBytes: number
  kind: string | null
  propertyId: string | null
  unitId: string | null
  tenancyId: string | null
  mortgageId: string | null
}): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  // Enforce the storage-path prefix matches the caller's org (defence
  // in depth — the bucket policy already does the same first-segment
  // check, but we don't trust the client path).
  const firstSegment = input.storagePath.split('/')[0]
  if (firstSegment !== auth.organisationId) {
    return {
      ok: false,
      error: 'Document path must be prefixed with your organisation id.',
    }
  }

  // At least one parent linkage.
  if (
    !input.propertyId &&
    !input.unitId &&
    !input.tenancyId &&
    !input.mortgageId
  ) {
    return {
      ok: false,
      error: 'Link the document to a property, unit, tenancy, or mortgage.',
    }
  }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('documents')
    .insert({
      organisation_id: auth.organisationId,
      property_id: input.propertyId,
      unit_id: input.unitId,
      tenancy_id: input.tenancyId,
      mortgage_id: input.mortgageId,
      storage_path: input.storagePath,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      uploaded_by_user_id: auth.userId,
      kind: input.kind,
      status: 'uploaded',
    })
    .select('id')
    .single<{ id: string }>()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'no row returned' }

  // Fire-and-forget OCR trigger. The route is idempotent — if it
  // fails to start (no CRON_SECRET in dev, network blip) the document
  // stays in `uploaded` state and an admin sweeper / manual re-trigger
  // can pick it up later.
  if (input.kind && COMPLIANCE_DOCUMENT_KINDS.has(input.kind as DocumentKind)) {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/jobs/ocr`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.CRON_SECRET ?? ''}`,
          },
          body: JSON.stringify({ documentId: data.id }),
        },
      )
    } catch {
      // Non-fatal — document is in uploaded state, can be retried.
    }
  }

  revalidatePath('/documents')
  return { ok: true, data: { id: data.id } }
}

export async function archiveDocument(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }
  const sb = await supabaseServer()
  const { error } = await sb
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/documents')
  return { ok: true, data: undefined }
}

export async function rejectExtraction(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }
  const sb = await supabaseServer()
  const { error } = await sb
    .from('documents')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/documents/${id}`)
  return { ok: true, data: undefined }
}

export async function confirmExtraction(input: unknown): Promise<ActionResult<{
  complianceItemId: string
}>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ConfirmExtractionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  if (!COMPLIANCE_DOCUMENT_KINDS.has(parsed.data.kind)) {
    return { ok: false, error: 'Kind does not map to a compliance item.' }
  }

  const sb = await supabaseServer()

  // Load the document so we can copy property_id onto the compliance row.
  const { data: doc, error: docErr } = await sb
    .from('documents')
    .select('id, property_id, unit_id, status')
    .eq('id', parsed.data.documentId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string
      property_id: string | null
      unit_id: string | null
      status: string
    }>()
  if (docErr) return { ok: false, error: docErr.message }
  if (!doc) return { ok: false, error: 'Document not found in your organisation.' }
  if (!doc.property_id) {
    return {
      ok: false,
      error: 'Document must be linked to a property before confirming.',
    }
  }
  if (doc.status === 'confirmed') {
    return { ok: false, error: 'Already confirmed.' }
  }

  const toIso = (d: Date | null): string | null =>
    d === null ? null : d.toISOString().slice(0, 10)

  // Create the compliance item.
  const { data: item, error: itemErr } = await sb
    .from('compliance_items')
    .insert({
      organisation_id: auth.organisationId,
      property_id: doc.property_id,
      unit_id: doc.unit_id,
      kind: parsed.data.kind,
      issue_date: toIso(parsed.data.issueDate),
      expiry_date: toIso(parsed.data.expiryDate),
      issuer: parsed.data.issuer,
      notes: parsed.data.notes,
      status: parsed.data.expiryDate ? 'valid' : 'missing',
      document_id: doc.id,
    })
    .select('id')
    .single<{ id: string }>()
  if (itemErr) return { ok: false, error: itemErr.message }
  if (!item) return { ok: false, error: 'compliance insert returned no row' }

  // Flip the document.
  const { error: docUpdateErr } = await sb
    .from('documents')
    .update({
      status: 'confirmed',
      confirmed_by_user_id: auth.userId,
      confirmed_at: new Date().toISOString(),
      derived_compliance_item_id: item.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', doc.id)
    .eq('organisation_id', auth.organisationId)
  if (docUpdateErr) return { ok: false, error: docUpdateErr.message }

  revalidatePath('/documents')
  revalidatePath(`/documents/${doc.id}`)
  revalidatePath('/compliance')
  return { ok: true, data: { complianceItemId: item.id } }
}
