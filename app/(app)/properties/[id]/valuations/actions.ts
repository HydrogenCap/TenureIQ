// app/(app)/properties/[id]/valuations/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { ValuationCreateSchema } from '@/lib/schemas/valuation'
import type { ActionResult } from '@/lib/types/action-result'

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Writes a valuation history row. When the new valuation is a
// market-grade kind (red_book or refinance) AND its date is at-or-after
// the property's current_valuation_as_of, also updates the property's
// fast-read fields. Estimate / desktop / estate-agent valuations do not
// override the live valuation (they're informational only).
export async function addValuation(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ValuationCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  // Property ownership check (defence-in-depth alongside RLS).
  const { data: property, error: propErr } = await sb
    .from('properties')
    .select('id, current_valuation_as_of')
    .eq('id', parsed.data.propertyId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; current_valuation_as_of: string | null }>()
  if (propErr) return { ok: false, error: propErr.message }
  if (!property) return { ok: false, error: 'Property not found in your organisation.' }

  const { data: valuationRow, error: valuationErr } = await sb
    .from('valuations')
    .insert({
      organisation_id: auth.organisationId,
      property_id: parsed.data.propertyId,
      valuation_date: toIso(parsed.data.valuationDate),
      value_pence: parsed.data.valuePence.toString(),
      kind: parsed.data.kind,
      source: parsed.data.source,
      notes: parsed.data.notes,
    })
    .select('id')
    .single<{ id: string }>()
  if (valuationErr) return { ok: false, error: valuationErr.message }
  if (!valuationRow) return { ok: false, error: 'No row returned' }

  // Update property current_valuation only for market-grade kinds that
  // are not older than the existing valuation.
  const isMarketGrade =
    parsed.data.kind === 'red_book' ||
    parsed.data.kind === 'refinance' ||
    parsed.data.kind === 'purchase'
  const isAtLeastAsRecent =
    property.current_valuation_as_of === null ||
    new Date(property.current_valuation_as_of) <= parsed.data.valuationDate

  if (isMarketGrade && isAtLeastAsRecent) {
    await sb
      .from('properties')
      .update({
        current_valuation_pence: parsed.data.valuePence.toString(),
        current_valuation_as_of: toIso(parsed.data.valuationDate),
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.propertyId)
      .eq('organisation_id', auth.organisationId)
  }

  revalidatePath(`/properties/${parsed.data.propertyId}`)
  revalidatePath('/mortgages')
  return { ok: true, data: { id: valuationRow.id } }
}
