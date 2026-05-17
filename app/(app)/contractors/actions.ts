// app/(app)/contractors/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { ContractorCreateSchema, type ContractorCreate } from '@/lib/schemas/maintenance'
import type { ActionResult } from '@/lib/types/action-result'

function rowFromInput(input: ContractorCreate) {
  return {
    entity_id: input.entityId,
    name: input.name,
    kind: input.kind,
    contact_name: input.contactName,
    phone: input.phone,
    email: input.email,
    insurance_expiry: input.insuranceExpiry
      ? input.insuranceExpiry.toISOString().slice(0, 10)
      : null,
    accreditations: input.accreditations,
    notes: input.notes,
  }
}

export async function createContractor(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ContractorCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('contractors')
    .insert({ organisation_id: auth.organisationId, ...rowFromInput(parsed.data) })
    .select('id')
    .single<{ id: string }>()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'no row returned' }

  revalidatePath('/contractors')
  return { ok: true, data: { id: data.id } }
}

export async function updateContractor(
  id: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ContractorCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('contractors')
    .update({ ...rowFromInput(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/contractors')
  revalidatePath(`/contractors/${id}`)
  return { ok: true, data: undefined }
}

export async function archiveContractor(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  // Refuse archive if there are active jobs assigned.
  const { data: openJobs } = await sb
    .from('maintenance_jobs')
    .select('id')
    .eq('assigned_contractor_id', id)
    .eq('organisation_id', auth.organisationId)
    .not('status', 'in', '(completed,cancelled)')
    .is('deleted_at', null)
    .limit(1)
  if (openJobs && openJobs.length > 0) {
    return {
      ok: false,
      error:
        'Contractor still has open jobs. Re-assign or complete them before archiving.',
    }
  }

  const { error } = await sb
    .from('contractors')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/contractors')
  return { ok: true, data: undefined }
}
