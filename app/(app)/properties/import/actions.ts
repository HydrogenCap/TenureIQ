// app/(app)/properties/import/actions.ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PropertyCreateSchema } from '@/lib/schemas/property'
import type { ActionResult } from '@/lib/types/action-result'

const BatchSchema = z.array(PropertyCreateSchema).min(1).max(50)

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function commitPropertyImport(
  batch: unknown,
): Promise<ActionResult<{ inserted: number }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = BatchSchema.safeParse(batch)
  if (!parsed.success) {
    return { ok: false, error: 'Invalid batch — reload and re-upload the file.' }
  }

  const entityIds = [...new Set(parsed.data.map((r) => r.entityId))]
  const sb = await supabaseServer()

  // RLS already constrains this query to the user's org; check that every
  // referenced entity is actually owned (and not archived) before insert.
  const { data: rawEntities, error: entityFetchError } = await sb
    .from('entities')
    .select('id')
    .in('id', entityIds)
    .is('deleted_at', null)
  if (entityFetchError) return { ok: false, error: entityFetchError.message }

  const allowed = new Set(
    ((rawEntities ?? []) as Array<{ id: string }>).map((e) => e.id),
  )
  const orphan = parsed.data.find((r) => !allowed.has(r.entityId))
  if (orphan) {
    return {
      ok: false,
      error: `Entity ${orphan.entityId} not found in your organisation.`,
    }
  }

  const payload = parsed.data.map((r) => ({
    organisation_id: auth.organisationId,
    entity_id: r.entityId,
    address_line_1: r.addressLine1,
    address_line_2: r.addressLine2,
    city: r.city,
    county: r.county,
    postcode: r.postcode,
    local_authority: r.localAuthority,
    brma_code: r.brmaCode,
    kind: r.kind,
    class_use: r.classUse,
    bedrooms_total: r.bedroomsTotal,
    bathrooms_total: r.bathroomsTotal,
    purchase_price_pence: r.purchasePricePence.toString(),
    purchase_date: toIso(r.purchaseDate),
    sdlt_paid_pence: r.sdltPaidPence?.toString() ?? null,
    refurb_cost_pence: r.refurbCostPence?.toString() ?? null,
    acquisition_costs_pence: r.acquisitionCostsPence?.toString() ?? null,
    epc_rating: r.epcRating,
    epc_expiry: r.epcExpiry ? toIso(r.epcExpiry) : null,
    hmo_licence_kind: r.hmoLicenceKind,
    hmo_licence_ref: r.hmoLicenceRef,
    hmo_licence_expiry: r.hmoLicenceExpiry ? toIso(r.hmoLicenceExpiry) : null,
    hmo_permitted_occupancy: r.hmoPermittedOccupancy,
    article_4_area: r.article4Area,
    is_aasc_property: r.isAascProperty,
    notes: r.notes,
  }))

  const { error } = await sb.from('properties').insert(payload)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/properties')
  return { ok: true, data: { inserted: parsed.data.length } }
}
