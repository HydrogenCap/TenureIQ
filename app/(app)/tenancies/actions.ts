// app/(app)/tenancies/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { createTenancyTx } from '@/lib/jobs/create-tenancy-tx'
import { supabaseServer } from '@/lib/db/user'
import {
  TenancyCreateSchema,
  TenancyUpdateSchema,
  GiveNoticeSchema,
  EndTenancySchema,
  RentChangeSchema,
} from '@/lib/schemas/tenancy'
import { meesStatus } from '@/lib/domain/mees'
import type { EpcBand } from '@/lib/domain/mees'
import type { ActionResult } from '@/lib/types/action-result'

type PropertyForMees = {
  id: string
  organisation_id: string
  epc_rating: string | null
  epc_expiry: string | null
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function fetchProperty(
  sb: Awaited<ReturnType<typeof supabaseServer>>,
  propertyId: string,
  organisationId: string,
): Promise<{ property: PropertyForMees | null; error: string | null }> {
  const { data, error } = await sb
    .from('properties')
    .select('id, organisation_id, epc_rating, epc_expiry')
    .eq('id', propertyId)
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .maybeSingle<PropertyForMees>()
  if (error) return { property: null, error: error.message }
  if (!data) return { property: null, error: 'Property not found in your organisation.' }
  return { property: data, error: null }
}

function meesBlockReason(p: PropertyForMees): string | null {
  const status = meesStatus(
    p.epc_rating === null ? null : (p.epc_rating as EpcBand),
    p.epc_expiry,
  )
  if (status === 'let_blocked') {
    return 'This property is EPC F or G and cannot legally be let. Improve the rating or register an exemption before creating a tenancy.'
  }
  return null
}

export async function createTenancy(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = TenancyCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  if (parsed.data.kind === 'aasc_placement') {
    return {
      ok: false,
      error: 'AASC placements are created from the AASC module, not the general tenancy form.',
    }
  }

  const sb = await supabaseServer()
  const { property, error: propError } = await fetchProperty(
    sb,
    parsed.data.propertyId,
    auth.organisationId,
  )
  if (propError) return { ok: false, error: propError }
  if (!property) return { ok: false, error: 'Property not found' }

  const meesError = meesBlockReason(property)
  if (meesError) {
    return { ok: false, error: meesError, fieldErrors: { propertyId: [meesError] } }
  }

  // The multi-step write (tenants → tenancy → joints → rent_changes
  // seed → unit-occupied) is transactional via create_tenancy_rpc.
  // Either everything lands or nothing does — no orphans.
  const txResult = await createTenancyTx({
    organisationId: auth.organisationId,
    propertyId: parsed.data.propertyId,
    unitId: parsed.data.unitId,
    kind: parsed.data.kind,
    startDate: parsed.data.startDate,
    endDateIntended: parsed.data.endDateIntended,
    rentPence: parsed.data.rentPence,
    rentPeriod: parsed.data.rentPeriod,
    depositPence: parsed.data.depositPence,
    depositScheme: parsed.data.depositScheme,
    depositSchemeRef: parsed.data.depositSchemeRef,
    aascPlacementRef: parsed.data.aascPlacementRef,
    aascContractor: parsed.data.aascContractor,
    notes: parsed.data.notes,
    tenants: parsed.data.tenants,
  })
  if (!txResult.ok) {
    return { ok: false, error: `Tenancy creation failed: ${txResult.error}` }
  }

  revalidatePath('/tenancies')
  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: { id: txResult.tenancyId } }
}

export async function updateTenancy(
  id: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = TenancyUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('tenancies')
    .update({
      property_id: parsed.data.propertyId,
      unit_id: parsed.data.unitId,
      kind: parsed.data.kind,
      start_date: toIso(parsed.data.startDate),
      end_date_intended: parsed.data.endDateIntended
        ? toIso(parsed.data.endDateIntended)
        : null,
      rent_pence: parsed.data.rentPence.toString(),
      rent_period: parsed.data.rentPeriod,
      deposit_pence: parsed.data.depositPence?.toString() ?? null,
      deposit_scheme: parsed.data.depositScheme,
      deposit_scheme_ref: parsed.data.depositSchemeRef,
      aasc_placement_ref: parsed.data.aascPlacementRef,
      aasc_contractor: parsed.data.aascContractor,
      notes: parsed.data.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/tenancies')
  revalidatePath(`/tenancies/${id}`)
  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: undefined }
}

export async function giveNotice(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = GiveNoticeSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('tenancies')
    .update({
      notice_given_at: toIso(parsed.data.noticeGivenAt),
      vacate_date: toIso(parsed.data.vacateDate),
      status: 'notice_given',
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.tenancyId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/tenancies')
  revalidatePath(`/tenancies/${parsed.data.tenancyId}`)
  return { ok: true, data: undefined }
}

export async function endTenancy(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = EndTenancySchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  // Fetch unit_id + property_id so we can mark the unit vacant on end —
  // scoped by property for defence-in-depth.
  const { data: t, error: tErr } = await sb
    .from('tenancies')
    .select('unit_id, property_id, organisation_id')
    .eq('id', parsed.data.tenancyId)
    .eq('organisation_id', auth.organisationId)
    .maybeSingle<{ unit_id: string | null; property_id: string; organisation_id: string }>()
  if (tErr) return { ok: false, error: tErr.message }
  if (!t) return { ok: false, error: 'Tenancy not found in your organisation.' }

  const { error } = await sb
    .from('tenancies')
    .update({
      end_date: toIso(parsed.data.endDate),
      status: 'ended',
      notes: parsed.data.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.tenancyId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  if (t.unit_id) {
    const { error: unitErr } = await sb
      .from('units')
      .update({ status: 'vacant', updated_at: new Date().toISOString() })
      .eq('id', t.unit_id)
      .eq('property_id', t.property_id)
    if (unitErr) console.error('endTenancy: unit-vacate update failed', unitErr)
  }

  revalidatePath('/tenancies')
  revalidatePath(`/tenancies/${parsed.data.tenancyId}`)
  return { ok: true, data: undefined }
}

export async function recordRentChange(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = RentChangeSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  // Insert the history row.
  const { error: rcErr } = await sb.from('rent_changes').insert({
    organisation_id: auth.organisationId,
    tenancy_id: parsed.data.tenancyId,
    effective_from: toIso(parsed.data.effectiveFrom),
    new_rent_pence: parsed.data.newRentPence.toString(),
    new_rent_period: parsed.data.newRentPeriod,
    reason: parsed.data.reason,
    notes: parsed.data.notes,
  })
  if (rcErr) return { ok: false, error: rcErr.message }

  // Update the tenancy's current rent (denormalised for fast reads).
  const { error: tErr } = await sb
    .from('tenancies')
    .update({
      rent_pence: parsed.data.newRentPence.toString(),
      rent_period: parsed.data.newRentPeriod,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.tenancyId)
    .is('deleted_at', null)
  if (tErr) return { ok: false, error: tErr.message }

  revalidatePath(`/tenancies/${parsed.data.tenancyId}`)
  return { ok: true, data: undefined }
}
