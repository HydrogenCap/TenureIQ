// lib/jobs/create-tenancy-tx.ts
// Service-role wrapper around the create_tenancy_rpc PL/pgSQL function.
// The action (app/(app)/tenancies/actions.ts) verifies the caller's
// org + property + MEES gate, then delegates the five-step write to
// this helper so the whole sequence runs in one Postgres transaction.

import 'server-only'
import { supabaseService } from '@/lib/db/admin'

export type CreateTenancyTxInput = {
  organisationId: string
  propertyId: string
  unitId: string | null
  kind: string
  startDate: Date
  endDateIntended: Date | null
  rentPence: bigint
  rentPeriod: string
  depositPence: bigint | null
  depositScheme: string | null
  depositSchemeRef: string | null
  aascPlacementRef: string | null
  aascContractor: string | null
  notes: string | null
  tenants: Array<{
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    rightToRentChecked: boolean
    rightToRentExpiry: Date | null
    notes: string | null
  }>
}

export type CreateTenancyTxResult =
  | { ok: true; tenancyId: string; leadTenantId: string | null }
  | { ok: false; error: string }

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10)
}

export async function createTenancyTx(
  input: CreateTenancyTxInput,
): Promise<CreateTenancyTxResult> {
  const sb = supabaseService()
  const { data, error } = await sb.rpc('create_tenancy_rpc', {
    p_organisation_id: input.organisationId,
    p_property_id: input.propertyId,
    p_unit_id: input.unitId,
    p_kind: input.kind,
    p_start_date: toIso(input.startDate),
    p_end_date_intended: toIso(input.endDateIntended),
    p_rent_pence: input.rentPence.toString(),
    p_rent_period: input.rentPeriod,
    p_deposit_pence: input.depositPence?.toString() ?? null,
    p_deposit_scheme: input.depositScheme,
    p_deposit_scheme_ref: input.depositSchemeRef,
    p_aasc_placement_ref: input.aascPlacementRef,
    p_aasc_contractor: input.aascContractor,
    p_notes: input.notes,
    p_tenants: input.tenants.map((t) => ({
      first_name: t.firstName,
      last_name: t.lastName,
      email: t.email,
      phone: t.phone,
      right_to_rent_checked: t.rightToRentChecked,
      right_to_rent_expiry: toIso(t.rightToRentExpiry),
      notes: t.notes,
    })),
  })
  if (error) return { ok: false, error: error.message }

  // RPC returns table; supabase-js gives back an array of rows.
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object' || !('tenancy_id' in row)) {
    return { ok: false, error: 'create_tenancy_rpc returned no row' }
  }
  return {
    ok: true,
    tenancyId: (row as { tenancy_id: string }).tenancy_id,
    leadTenantId:
      (row as { lead_tenant_id: string | null }).lead_tenant_id ?? null,
  }
}
