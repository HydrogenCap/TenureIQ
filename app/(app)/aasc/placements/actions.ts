// app/(app)/aasc/placements/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { createAascPlacementTx } from '@/lib/jobs/create-aasc-placement-tx'
import { recordClosedAreaOverride } from '@/lib/jobs/record-closed-area-override'
import {
  AascPlacementCreateSchema,
  EndPlacementSchema,
  UpdateServiceUserCountSchema,
} from '@/lib/schemas/aasc'
import type { ActionResult } from '@/lib/types/action-result'
import { clearspringsMaxWeeklyPence } from '@/lib/domain/aasc'

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

// Look up the latest aasc_areas snapshot for a contractor + local
// authority. Areas are global reference data keyed on (contractor,
// local_authority, effective_date); we take the most recent snapshot.
// No match (or a property without a local_authority) means "unknown
// area" — we do not block on unknowns.
async function lookupAascAreaStatus(
  sb: Awaited<ReturnType<typeof supabaseServer>>,
  contractor: string,
  localAuthority: string | null,
): Promise<{ localAuthority: string; status: string } | null> {
  if (!localAuthority) return null
  const { data } = await sb
    .from('aasc_areas')
    .select('local_authority, status, effective_date')
    .eq('contractor', contractor)
    .ilike('local_authority', localAuthority)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle<{ local_authority: string; status: string | null; effective_date: string }>()
  if (!data || data.status === null) return null
  return { localAuthority: data.local_authority, status: data.status }
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
    .select('id, organisation_id, brma_code, local_authority, is_aasc_property')
    .eq('id', parsed.data.propertyId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string
      organisation_id: string
      brma_code: string | null
      local_authority: string | null
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

  // M9 closed-area gate: contractors (notably Serco) publish a
  // per-local-authority sourcing status. Creating a placement in a
  // CLOSED area is refused unless the caller explicitly overrides —
  // and every override is recorded in the audit log below.
  let closedAreaOverride: { localAuthority: string; status: string } | null = null
  const area = await lookupAascAreaStatus(
    sb,
    contract.contractor,
    prop.local_authority,
  )
  if (area && area.status === 'closed') {
    if (!parsed.data.overrideClosedArea) {
      return {
        ok: false,
        error: `${contract.contractor === 'serco' ? 'Serco' : 'Clearsprings'} has CLOSED the "${area.localAuthority}" area (status: ${area.status}) — new placements there are unlikely to be accepted. Tick "Override closed-area warning" to create it anyway; the override will be recorded in the audit log.`,
      }
    }
    closedAreaOverride = area
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
      .eq('organisation_id', auth.organisationId)
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

  // Transactional via create_aasc_placement_rpc. The five-step write
  // (placement → linked tenancy → tenancy_id backfill → count_changes
  // seed → unit-occupied marker) runs in a single Postgres transaction.
  // Convention #13: the linked tenancy is created with tenant_id = null
  // by the RPC — no identity columns touched anywhere in the path.
  const txResult = await createAascPlacementTx({
    organisationId: auth.organisationId,
    contractId: parsed.data.contractId,
    propertyId: parsed.data.propertyId,
    unitId: parsed.data.unitId,
    placementRef: parsed.data.placementRef,
    weeklyRatePence: parsed.data.weeklyRatePence,
    commissionRateBpsOverride: parsed.data.commissionRateBpsOverride,
    serviceUserCount: parsed.data.serviceUserCount,
    startDate: parsed.data.startDate,
    endDateExpected: parsed.data.endDateExpected,
  })
  if (!txResult.ok) {
    return { ok: false, error: `Placement creation failed: ${txResult.error}` }
  }

  // Record the closed-area override in the audit log. audit_log writes
  // are normally trigger-only (RLS has select-only policies), so this
  // goes through the service-role client — the same trusted server path
  // the triggers use. Best-effort: a failure here must not orphan the
  // already-committed placement.
  if (closedAreaOverride) {
    await recordClosedAreaOverride({
      actorUserId: auth.userId,
      organisationId: auth.organisationId,
      placementId: txResult.placementId,
      contractor: contract.contractor,
      localAuthority: closedAreaOverride.localAuthority,
      areaStatus: closedAreaOverride.status,
      placementRef: parsed.data.placementRef,
    })
  }

  revalidatePath('/aasc/placements')
  revalidatePath('/aasc')
  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: { id: txResult.placementId } }
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
      .eq('organisation_id', auth.organisationId)
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
