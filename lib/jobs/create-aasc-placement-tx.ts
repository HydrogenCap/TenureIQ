// lib/jobs/create-aasc-placement-tx.ts
// Service-role wrapper around create_aasc_placement_rpc. Wraps the
// five-step sequence (placement → linked tenancy → tenancy_id back-
// fill → count-change seed → unit-occupied marker) in one transaction.
//
// Convention #13: AASC never references the tenants table. The linked
// tenancy is created with tenant_id = null. No identity columns ever
// touched.

import 'server-only'
import { supabaseService } from '@/lib/db/admin'

export type CreateAascPlacementTxInput = {
  organisationId: string
  contractId: string
  propertyId: string
  unitId: string | null
  placementRef: string
  weeklyRatePence: bigint
  commissionRateBpsOverride: number | null
  serviceUserCount: number
  startDate: Date
  endDateExpected: Date | null
}

export type CreateAascPlacementTxResult =
  | { ok: true; placementId: string; tenancyId: string }
  | { ok: false; error: string }

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10)
}

export async function createAascPlacementTx(
  input: CreateAascPlacementTxInput,
): Promise<CreateAascPlacementTxResult> {
  const sb = supabaseService()
  const { data, error } = await sb.rpc('create_aasc_placement_rpc', {
    p_organisation_id: input.organisationId,
    p_contract_id: input.contractId,
    p_property_id: input.propertyId,
    p_unit_id: input.unitId,
    p_placement_ref: input.placementRef,
    p_weekly_rate_pence: input.weeklyRatePence.toString(),
    p_commission_rate_bps_override: input.commissionRateBpsOverride,
    p_service_user_count: input.serviceUserCount,
    p_start_date: toIso(input.startDate),
    p_end_date_expected: toIso(input.endDateExpected),
  })
  if (error) return { ok: false, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object' || !('placement_id' in row)) {
    return { ok: false, error: 'create_aasc_placement_rpc returned no row' }
  }
  return {
    ok: true,
    placementId: (row as { placement_id: string }).placement_id,
    tenancyId: (row as { tenancy_id: string }).tenancy_id,
  }
}
