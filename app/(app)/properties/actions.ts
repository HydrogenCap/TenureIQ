// app/(app)/properties/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import {
  PropertyCreateSchema,
  PropertyUpdateSchema,
  SetCurrentValuationSchema,
} from '@/lib/schemas/property'
import type { ActionResult } from '@/lib/types/action-result'

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rowFromInput(input: ReturnType<typeof PropertyCreateSchema.parse>) {
  return {
    entity_id: input.entityId,
    address_line_1: input.addressLine1,
    address_line_2: input.addressLine2,
    city: input.city,
    county: input.county,
    postcode: input.postcode,
    local_authority: input.localAuthority,
    brma_code: input.brmaCode,
    kind: input.kind,
    class_use: input.classUse,
    bedrooms_total: input.bedroomsTotal,
    bathrooms_total: input.bathroomsTotal,
    purchase_price_pence: input.purchasePricePence.toString(),
    purchase_date: toIsoDate(input.purchaseDate),
    sdlt_paid_pence: input.sdltPaidPence?.toString() ?? null,
    refurb_cost_pence: input.refurbCostPence?.toString() ?? null,
    acquisition_costs_pence: input.acquisitionCostsPence?.toString() ?? null,
    epc_rating: input.epcRating,
    epc_expiry: input.epcExpiry ? toIsoDate(input.epcExpiry) : null,
    hmo_licence_kind: input.hmoLicenceKind,
    hmo_licence_ref: input.hmoLicenceRef,
    hmo_licence_expiry: input.hmoLicenceExpiry ? toIsoDate(input.hmoLicenceExpiry) : null,
    hmo_permitted_occupancy: input.hmoPermittedOccupancy,
    article_4_area: input.article4Area,
    is_aasc_property: input.isAascProperty,
    notes: input.notes,
  }
}

async function assertEntityOwnership(entityId: string, organisationId: string): Promise<string | null> {
  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('entities')
    .select('id')
    .eq('id', entityId)
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return error.message
  if (!data) return 'Selected entity not found in your organisation.'
  return null
}

export async function createProperty(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = PropertyCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const ownershipError = await assertEntityOwnership(parsed.data.entityId, auth.organisationId)
  if (ownershipError) {
    return { ok: false, error: ownershipError, fieldErrors: { entityId: [ownershipError] } }
  }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('properties')
    .insert({ organisation_id: auth.organisationId, ...rowFromInput(parsed.data) })
    .select('id')
    .single<{ id: string }>()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No row returned after insert' }

  revalidatePath('/properties')
  return { ok: true, data: { id: data.id } }
}

export async function updateProperty(id: string, input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = PropertyUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const ownershipError = await assertEntityOwnership(parsed.data.entityId, auth.organisationId)
  if (ownershipError) {
    return { ok: false, error: ownershipError, fieldErrors: { entityId: [ownershipError] } }
  }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('properties')
    .update({ ...rowFromInput(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/properties')
  revalidatePath(`/properties/${id}`)
  return { ok: true, data: undefined }
}

export async function archiveProperty(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('properties')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/properties')
  revalidatePath(`/properties/${id}`)
  return { ok: true, data: undefined }
}

export async function restoreProperty(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('properties')
    .update({ deleted_at: null })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/properties')
  revalidatePath(`/properties/${id}`)
  return { ok: true, data: undefined }
}

export async function setCurrentValuation(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = SetCurrentValuationSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const sb = await supabaseServer()

  // 1. Write a valuation history row.
  const { error: valuationInsertError } = await sb.from('valuations').insert({
    organisation_id: auth.organisationId,
    property_id: parsed.data.propertyId,
    valuation_date: toIsoDate(parsed.data.asOf),
    value_pence: parsed.data.valuationPence.toString(),
    kind: parsed.data.kind,
    source: parsed.data.source,
    notes: parsed.data.notes,
  })
  if (valuationInsertError) return { ok: false, error: valuationInsertError.message }

  // 2. Update the property's fast-read fields.
  const { error: propertyUpdateError } = await sb
    .from('properties')
    .update({
      current_valuation_pence: parsed.data.valuationPence.toString(),
      current_valuation_as_of: toIsoDate(parsed.data.asOf),
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.propertyId)
    .is('deleted_at', null)
  if (propertyUpdateError) return { ok: false, error: propertyUpdateError.message }

  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: undefined }
}
