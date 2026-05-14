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

  if (error) return { ok: false, error: error.message }

  revalidatePath('/entities')
  revalidatePath(`/entities/${id}`)
  return { ok: true, data: undefined }
}
