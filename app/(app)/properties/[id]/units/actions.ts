// app/(app)/properties/[id]/units/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { UnitCreateSchema, UnitUpdateSchema } from '@/lib/schemas/unit'
import type { ActionResult } from '@/lib/types/action-result'

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

function rowFromInput(input: ReturnType<typeof UnitCreateSchema.parse>) {
  return {
    label: input.label,
    bedrooms: input.bedrooms,
    bathrooms_ensuite: input.bathroomsEnsuite,
    floor_area_sqm: input.floorAreaSqm,
    market_rent_pence: input.marketRentPence?.toString() ?? null,
    status: input.status,
    notes: input.notes,
  }
}

export async function createUnit(
  propertyId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = UnitCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const ownershipError = await assertPropertyOwnership(propertyId, auth.organisationId)
  if (ownershipError) return { ok: false, error: ownershipError }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('units')
    .insert({ property_id: propertyId, ...rowFromInput(parsed.data) })
    .select('id')
    .single<{ id: string }>()

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'A unit with this label already exists on this property.',
        fieldErrors: { label: ['Already in use'] },
      }
    }
    return { ok: false, error: error.message }
  }
  if (!data) return { ok: false, error: 'No row returned' }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath(`/properties/${propertyId}/units`)
  return { ok: true, data: { id: data.id } }
}

export async function updateUnit(
  propertyId: string,
  unitId: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = UnitUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const ownershipError = await assertPropertyOwnership(propertyId, auth.organisationId)
  if (ownershipError) return { ok: false, error: ownershipError }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('units')
    .update({ ...rowFromInput(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', unitId)
    .eq('property_id', propertyId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath(`/properties/${propertyId}/units`)
  revalidatePath(`/properties/${propertyId}/units/${unitId}`)
  return { ok: true, data: undefined }
}

export async function archiveUnit(
  propertyId: string,
  unitId: string,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const ownershipError = await assertPropertyOwnership(propertyId, auth.organisationId)
  if (ownershipError) return { ok: false, error: ownershipError }

  const sb = await supabaseServer()

  // Block archive if an active tenancy exists.
  const { data: activeTenancies, error: tenancyErr } = await sb
    .from('tenancies')
    .select('id')
    .eq('unit_id', unitId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(1)
  if (tenancyErr) return { ok: false, error: tenancyErr.message }
  if (activeTenancies && activeTenancies.length > 0) {
    return {
      ok: false,
      error: 'Cannot archive a unit with an active tenancy. End the tenancy first.',
    }
  }

  const { error } = await sb
    .from('units')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', unitId)
    .eq('property_id', propertyId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath(`/properties/${propertyId}/units`)
  return { ok: true, data: undefined }
}
