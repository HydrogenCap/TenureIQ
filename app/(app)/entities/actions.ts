// app/(app)/entities/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { EntityCreateSchema, EntityUpdateSchema } from '@/lib/schemas/entity'
import type { ActionResult } from '@/lib/types/action-result'

function rowFromInput(input: ReturnType<typeof EntityCreateSchema.parse>) {
  return {
    name: input.name,
    kind: input.kind,
    companies_house_number: input.companiesHouseNumber,
    registered_address: input.registeredAddress,
    hmrc_utr: input.hmrcUtr,
    vat_number: input.vatNumber,
    year_end_month: input.yearEndMonth,
    year_end_day: input.yearEndDay,
    notes: input.notes,
  }
}

export async function createEntity(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = EntityCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('entities')
    .insert({ organisation_id: auth.organisationId, ...rowFromInput(parsed.data) })
    .select('id')
    .single<{ id: string }>()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'An entity with this Companies House number already exists.' }
    }
    return { ok: false, error: error.message }
  }
  if (!data) return { ok: false, error: 'No row returned after insert' }

  revalidatePath('/entities')
  return { ok: true, data: { id: data.id } }
}

export async function updateEntity(id: string, input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = EntityUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('entities')
    .update({ ...rowFromInput(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/entities')
  revalidatePath(`/entities/${id}`)
  return { ok: true, data: undefined }
}

export async function archiveEntity(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('entities')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/entities')
  revalidatePath(`/entities/${id}`)
  return { ok: true, data: undefined }
}

export async function restoreEntity(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('entities')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/entities')
  revalidatePath(`/entities/${id}`)
  return { ok: true, data: undefined }
}

// =========================================================================
// Shareholders (companies-house-style roster). RLS gates rows via the
// entity FK; we still add the explicit org filter on the entity lookup
// for defence-in-depth per rule 11.
// =========================================================================

import {
  ShareholderCreateSchema,
  ShareholderUpdateSchema,
} from '@/lib/schemas/shareholder'

async function assertEntityInOrg(
  entityId: string,
  organisationId: string,
): Promise<string | null> {
  const sb = await supabaseServer()
  const { data } = await sb
    .from('entities')
    .select('id')
    .eq('id', entityId)
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!data) return 'Entity not found in your organisation.'
  return null
}

function shareholderRowFromInput(
  input: ReturnType<typeof ShareholderCreateSchema.parse>,
) {
  return {
    name: input.name,
    share_count: input.shareCount,
    share_class: input.shareClass,
    is_director: input.isDirector,
    appointed_date: input.appointedDate
      ? input.appointedDate.toISOString().slice(0, 10)
      : null,
    resigned_date: input.resignedDate
      ? input.resignedDate.toISOString().slice(0, 10)
      : null,
  }
}

export async function createShareholder(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ShareholderCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const ownership = await assertEntityInOrg(parsed.data.entityId, auth.organisationId)
  if (ownership) return { ok: false, error: ownership }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('shareholders')
    .insert({
      entity_id: parsed.data.entityId,
      ...shareholderRowFromInput(parsed.data),
    })
    .select('id')
    .single<{ id: string }>()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No row returned after insert' }

  revalidatePath(`/entities/${parsed.data.entityId}`)
  return { ok: true, data: { id: data.id } }
}

export async function updateShareholder(
  id: string,
  entityId: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ShareholderUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const ownership = await assertEntityInOrg(entityId, auth.organisationId)
  if (ownership) return { ok: false, error: ownership }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('shareholders')
    .update({
      ...shareholderRowFromInput({ ...parsed.data, entityId }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('entity_id', entityId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/entities/${entityId}`)
  return { ok: true, data: undefined }
}

export async function deleteShareholder(
  id: string,
  entityId: string,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const ownership = await assertEntityInOrg(entityId, auth.organisationId)
  if (ownership) return { ok: false, error: ownership }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('shareholders')
    .delete()
    .eq('id', id)
    .eq('entity_id', entityId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/entities/${entityId}`)
  return { ok: true, data: undefined }
}

// =========================================================================
// Director's loan account ledger entries. Each row is one signed
// movement; balance is derived live via the domain helper.
// =========================================================================

import { DirectorLoanEntrySchema } from '@/lib/schemas/director-loan'
import {
  directorLoanSignViolation,
  type DirectorLoanKind,
} from '@/lib/domain/director-loan'

function loanRowFromInput(
  input: ReturnType<typeof DirectorLoanEntrySchema.parse>,
) {
  return {
    director_name: input.directorName,
    kind: input.kind,
    event_date: input.eventDate.toISOString().slice(0, 10),
    amount_pence: input.amountPence.toString(),
    description: input.description,
  }
}

export async function createDirectorLoanEntry(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = DirectorLoanEntrySchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  // Sign-convention guard. See lib/domain/director-loan.ts.
  const violation = directorLoanSignViolation(
    parsed.data.kind as DirectorLoanKind,
    parsed.data.amountPence,
  )
  if (violation) {
    return {
      ok: false,
      error: violation,
      fieldErrors: { amountPence: [violation] },
    }
  }

  const ownership = await assertEntityInOrg(parsed.data.entityId, auth.organisationId)
  if (ownership) return { ok: false, error: ownership }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('director_loans')
    .insert({
      organisation_id: auth.organisationId,
      entity_id: parsed.data.entityId,
      ...loanRowFromInput(parsed.data),
    })
    .select('id')
    .single<{ id: string }>()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No row returned after insert' }

  revalidatePath(`/entities/${parsed.data.entityId}`)
  return { ok: true, data: { id: data.id } }
}

export async function archiveDirectorLoanEntry(
  id: string,
  entityId: string,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const ownership = await assertEntityInOrg(entityId, auth.organisationId)
  if (ownership) return { ok: false, error: ownership }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('director_loans')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('entity_id', entityId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/entities/${entityId}`)
  return { ok: true, data: undefined }
}
