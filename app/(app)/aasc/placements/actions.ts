// app/(app)/aasc/placements/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import {
  AascPlacementCreateSchema,
  EndPlacementSchema,
  UpdateServiceUserCountSchema,
} from '@/lib/schemas/aasc'
import type { ActionResult } from '@/lib/types/action-result'
import { clearspringsMaxWeeklyPence } from '@/lib/domain/aasc'

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10)
}

// Look up LHA SAR for the property's BRMA so we can enforce the
// Clearsprings ceiling. Returns null if no rate is known — we don't
// hard-block in that case, just skip the check.
async function lookupLhaSarWeeklyPence(
  sb: Awaited<ReturnType<typeof supabaseServer>>,
  brmaCode: string | null,
): Promise<bigint | null> {
  if (!brmaCode) return null
  const { data } = await sb
    .from('lha_rates')
    .select('weekly_pence, effective_from, effective_to')
    .eq('brma_code', brmaCode)
    .eq('beds', 'SAR')
  type R = { weekly_pence: string | number; effective_from: string; effective_to: string | null }
  const rows = (data ?? []) as R[]
  const today = new Date()
  for (const r of rows) {
    const from = new Date(r.effective_from)
    const to = r.effective_to ? new Date(r.effective_to) : null
    if (from <= today && (to === null || today < to)) {
      const v = r.weekly_pence
      return BigInt(typeof v === 'string' ? v : Math.round(v))
    }
  }
  return null
}

export async function createPlacement(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = AascPlacementCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  // Property ownership + AASC eligibility + BRMA lookup.
  const { data: prop, error: propErr } = await sb
    .from('properties')
    .select('id, organisation_id, brma_code, is_aasc_property')
    .eq('id', parsed.data.propertyId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string
      organisation_id: string
      brma_code: string | null
      is_aasc_property: boolean
    }>()
  if (propErr) return { ok: false, error: propErr.message }
  if (!prop) return { ok: false, error: 'Property not found in your organisation.' }
  if (!prop.is_aasc_property) {
    return {
      ok: false,
      error:
        'Property is not flagged as AASC. Flip is_aasc_property on the property first.',
      fieldErrors: { propertyId: ['Not flagged as AASC'] },
    }
  }

  // Contract ownership + contractor (for the ceiling check).
  const { data: contract, error: cErr } = await sb
    .from('aasc_contracts')
    .select('id, contractor, status, commission_rate_bps')
    .eq('id', parsed.data.contractId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string
      contractor: string
      status: string
      commission_rate_bps: number
    }>()
  if (cErr) return { ok: false, error: cErr.message }
  if (!contract) {
    return { ok: false, error: 'Contract not found in your organisation.' }
  }
  if (contract.status !== 'active') {
    return {
      ok: false,
      error: `Contract is ${contract.status}; cannot create new placements against it.`,
    }
  }

  // Clearsprings ceiling: weekly rate must be ≤ LHA SAR × 1.40.
  if (contract.contractor === 'clearsprings') {
    const sar = await lookupLhaSarWeeklyPence(sb, prop.brma_code)
    if (sar !== null) {
      const ceiling = clearspringsMaxWeeklyPence(sar)
      if (parsed.data.weeklyRatePence > ceiling) {
        return {
          ok: false,
          error: `Weekly rate exceeds the Clearsprings ceiling of LHA SAR × 1.40 (£${(Number(ceiling) / 100).toFixed(2)} for this BRMA). Clearsprings does not approve rates above this.`,
          fieldErrors: { weeklyRatePence: ['Above the Clearsprings ceiling'] },
        }
      }
    }
  }

  // Unit ownership check (when provided).
  if (parsed.data.unitId) {
    const { data: u } = await sb
      .from('units')
      .select('id')
      .eq('id', parsed.data.unitId)
      .eq('property_id', parsed.data.propertyId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string }>()
    if (!u) {
      return {
        ok: false,
        error: 'Unit not found on this property.',
        fieldErrors: { unitId: ['Not found'] },
      }
    }
  }

  // 1. Create the placement (no identity columns are even passed).
  const { data: placement, error: pErr } = await sb
    .from('aasc_placements')
    .insert({
      organisation_id: auth.organisationId,
      contract_id: parsed.data.contractId,
      property_id: parsed.data.propertyId,
      unit_id: parsed.data.unitId,
      placement_ref: parsed.data.placementRef,
      weekly_rate_pence: parsed.data.weeklyRatePence.toString(),
      commission_rate_bps_override: parsed.data.commissionRateBpsOverride,
      service_user_count: parsed.data.serviceUserCount,
      start_date: parsed.data.startDate.toISOString().slice(0, 10),
      end_date_expected: toIso(parsed.data.endDateExpected),
      status: 'active',
    })
    .select('id')
    .single<{ id: string }>()
  if (pErr) return { ok: false, error: pErr.message }
  if (!placement) return { ok: false, error: 'placement insert returned no row' }

  // 2. Auto-create the linked tenancy of kind aasc_placement. No
  //    tenant FK — AASC placements never reference the tenants table.
  const { data: tenancy, error: tErr } = await sb
    .from('tenancies')
    .insert({
      organisation_id: auth.organisationId,
      property_id: parsed.data.propertyId,
      unit_id: parsed.data.unitId,
      tenant_id: null,
      kind: 'aasc_placement',
      start_date: parsed.data.startDate.toISOString().slice(0, 10),
      end_date_intended: toIso(parsed.data.endDateExpected),
      rent_pence: parsed.data.weeklyRatePence.toString(),
      rent_period: 'weekly',
      aasc_placement_ref: parsed.data.placementRef,
      aasc_contractor: contract.contractor,
      status: 'active',
    })
    .select('id')
    .single<{ id: string }>()
  if (tErr) {
    // Best-effort cleanup of the placement so we don't leave an orphan.
    await sb
      .from('aasc_placements')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', placement.id)
    return { ok: false, error: `tenancy insert: ${tErr.message}` }
  }

  // 3. Link the placement to the tenancy.
  if (tenancy) {
    await sb
      .from('aasc_placements')
      .update({ tenancy_id: tenancy.id })
      .eq('id', placement.id)
  }

  // 4. Seed the count-change ledger.
  await sb.from('placement_count_changes').insert({
    organisation_id: auth.organisationId,
    placement_id: placement.id,
    effective_from: parsed.data.startDate.toISOString().slice(0, 10),
    new_count: parsed.data.serviceUserCount,
    reason: 'initial',
  })

  // 5. Mark the unit occupied (if any).
  if (parsed.data.unitId) {
    await sb
      .from('units')
      .update({ status: 'occupied', updated_at: new Date().toISOString() })
      .eq('id', parsed.data.unitId)
      .eq('property_id', parsed.data.propertyId)
  }

  revalidatePath('/aasc/placements')
  revalidatePath('/aasc')
  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: { id: placement.id } }
}

export async function endPlacement(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = EndPlacementSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  // Pull tenancy + unit so we can end the linked tenancy and vacate
  // the unit.
  const { data: placement } = await sb
    .from('aasc_placements')
    .select('id, tenancy_id, unit_id, property_id, organisation_id')
    .eq('id', parsed.data.placementId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string
      tenancy_id: string | null
      unit_id: string | null
      property_id: string
      organisation_id: string
    }>()
  if (!placement) {
    return { ok: false, error: 'Placement not found in your organisation.' }
  }

  const iso = parsed.data.endDateActual.toISOString().slice(0, 10)
  const status =
    parsed.data.reason === 'terminated_provider' ||
    parsed.data.reason === 'terminated_landlord'
      ? 'terminated'
      : 'ended'

  const { error: pErr } = await sb
    .from('aasc_placements')
    .update({
      status,
      end_date: iso,
      updated_at: new Date().toISOString(),
    })
    .eq('id', placement.id)
    .eq('organisation_id', auth.organisationId)
  if (pErr) return { ok: false, error: pErr.message }

  if (placement.tenancy_id) {
    await sb
      .from('tenancies')
      .update({
        status: 'ended',
        end_date: iso,
        notes: parsed.data.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', placement.tenancy_id)
      .eq('organisation_id', auth.organisationId)
  }

  if (placement.unit_id) {
    await sb
      .from('units')
      .update({ status: 'vacant', updated_at: new Date().toISOString() })
      .eq('id', placement.unit_id)
      .eq('property_id', placement.property_id)
  }

  revalidatePath('/aasc/placements')
  revalidatePath(`/aasc/placements/${placement.id}`)
  revalidatePath(`/properties/${placement.property_id}`)
  return { ok: true, data: undefined }
}

export async function updateServiceUserCount(
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = UpdateServiceUserCountSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  // Ownership.
  const { data: placement } = await sb
    .from('aasc_placements')
    .select('id, organisation_id')
    .eq('id', parsed.data.placementId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; organisation_id: string }>()
  if (!placement) {
    return { ok: false, error: 'Placement not found in your organisation.' }
  }

  // Append to the ledger.
  await sb.from('placement_count_changes').insert({
    organisation_id: auth.organisationId,
    placement_id: placement.id,
    effective_from: parsed.data.effectiveFrom.toISOString().slice(0, 10),
    new_count: parsed.data.newCount,
    reason: parsed.data.reason,
  })

  // Update the placement's denormalised count for fast reads.
  await sb
    .from('aasc_placements')
    .update({
      service_user_count: parsed.data.newCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', placement.id)
    .eq('organisation_id', auth.organisationId)

  revalidatePath(`/aasc/placements/${placement.id}`)
  return { ok: true, data: undefined }
}
