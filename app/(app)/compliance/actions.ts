// app/(app)/compliance/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import {
  ComplianceItemCreateSchema,
  ComplianceItemUpdateSchema,
  MarkExemptSchema,
  type ComplianceItemCreate,
} from '@/lib/schemas/compliance-item'
import { complianceStatus } from '@/lib/domain/compliance'
import type { ActionResult } from '@/lib/types/action-result'

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10)
}

async function assertPropertyOwnership(
  propertyId: string,
  organisationId: string,
): Promise<string | null> {
  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return error.message
  if (!data) return 'Property not found in your organisation.'
  return null
}

function rowFromInput(input: ComplianceItemCreate) {
  // Derive the stored status from the expiry date at write time. Triggers
  // can re-derive on schedule (M6 reminder engine); the column is the
  // single source of truth for "is this currently OK?" reads.
  const derivedStatus = complianceStatus(input.expiryDate)
  return {
    property_id: input.propertyId,
    unit_id: input.unitId,
    kind: input.kind,
    issue_date: toIso(input.issueDate),
    expiry_date: toIso(input.expiryDate),
    status: derivedStatus,
    issuer: input.issuer,
    document_id: input.documentId,
    notes: input.notes,
  }
}

export async function createComplianceItem(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ComplianceItemCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const ownErr = await assertPropertyOwnership(parsed.data.propertyId, auth.organisationId)
  if (ownErr) return { ok: false, error: ownErr, fieldErrors: { propertyId: [ownErr] } }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('compliance_items')
    .insert({ organisation_id: auth.organisationId, ...rowFromInput(parsed.data) })
    .select('id')
    .single<{ id: string }>()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No row returned' }

  revalidatePath('/compliance')
  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: { id: data.id } }
}

export async function updateComplianceItem(
  id: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ComplianceItemUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const ownErr = await assertPropertyOwnership(parsed.data.propertyId, auth.organisationId)
  if (ownErr) return { ok: false, error: ownErr }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('compliance_items')
    .update({ ...rowFromInput(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/compliance')
  revalidatePath(`/compliance/${id}`)
  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: undefined }
}

export async function archiveComplianceItem(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('compliance_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/compliance')
  return { ok: true, data: undefined }
}

export async function markExempt(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = MarkExemptSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('compliance_items')
    .update({
      status: 'exempt',
      notes: `EXEMPT: ${parsed.data.reason}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.itemId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/compliance')
  revalidatePath(`/compliance/${parsed.data.itemId}`)
  return { ok: true, data: undefined }
}
