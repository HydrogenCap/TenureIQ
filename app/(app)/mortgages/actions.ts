// app/(app)/mortgages/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import {
  MortgageCreateSchema,
  MortgageUpdateSchema,
  RecordMortgageEventSchema,
  SetCurrentBalanceSchema,
} from '@/lib/schemas/mortgage'
import { deriveBalancePence, type MortgageEventLike } from '@/lib/domain/mortgage'
import type { ActionResult } from '@/lib/types/action-result'

type MortgageInput = ReturnType<typeof MortgageCreateSchema.parse>

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rowFromInput(input: MortgageInput) {
  return {
    property_id: input.propertyId,
    lender: input.lender,
    account_ref: input.accountRef,
    product: input.product,
    original_loan_pence: input.originalLoanPence.toString(),
    current_balance_pence: input.currentBalancePence.toString(),
    interest_rate_bps: input.interestRateBps,
    monthly_payment_pence: input.monthlyPaymentPence.toString(),
    term_months: input.termMonths,
    fixed_end_date: input.fixedEndDate ? toIso(input.fixedEndDate) : null,
    is_interest_only: input.isInterestOnly,
    broker: input.broker,
    notes: input.notes,
  }
}

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

export async function createMortgage(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = MortgageCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const ownershipError = await assertPropertyOwnership(parsed.data.propertyId, auth.organisationId)
  if (ownershipError) {
    return { ok: false, error: ownershipError, fieldErrors: { propertyId: [ownershipError] } }
  }

  const sb = await supabaseServer()

  const { data: mortgageRow, error } = await sb
    .from('mortgages')
    .insert({ organisation_id: auth.organisationId, ...rowFromInput(parsed.data) })
    .select('id')
    .single<{ id: string }>()

  if (error) return { ok: false, error: error.message }
  if (!mortgageRow) return { ok: false, error: 'No row returned' }

  // Seed a `drawdown` event so the ledger is authoritative from day one.
  await sb.from('mortgage_events').insert({
    mortgage_id: mortgageRow.id,
    event_date: new Date().toISOString().slice(0, 10),
    kind: 'drawdown',
    balance_pence: parsed.data.currentBalancePence.toString(),
    amount_pence: parsed.data.originalLoanPence.toString(),
    rate_post_bps: parsed.data.interestRateBps,
    notes: 'Initial balance recorded on creation.',
  })

  revalidatePath('/mortgages')
  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: { id: mortgageRow.id } }
}

export async function updateMortgage(
  id: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = MortgageUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const ownershipError = await assertPropertyOwnership(parsed.data.propertyId, auth.organisationId)
  if (ownershipError) {
    return { ok: false, error: ownershipError, fieldErrors: { propertyId: [ownershipError] } }
  }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('mortgages')
    .update({ ...rowFromInput(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/mortgages')
  revalidatePath(`/mortgages/${id}`)
  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: undefined }
}

export async function archiveMortgage(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('mortgages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/mortgages')
  revalidatePath(`/mortgages/${id}`)
  return { ok: true, data: undefined }
}

// Records an event and (for payments/redemptions/reconciliations)
// re-derives the mortgage's current_balance_pence from the full event
// ledger so the column stays consistent with the history.
export async function recordMortgageEvent(
  input: unknown,
): Promise<ActionResult<{ eventId: string; newBalancePence: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = RecordMortgageEventSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  // Fetch the mortgage so we have the property_id (for revalidate) and
  // the original_loan_pence as the bedrock for derivation. Scoped by
  // org for defence-in-depth.
  const { data: mortgage, error: mortgageErr } = await sb
    .from('mortgages')
    .select('id, property_id, original_loan_pence')
    .eq('id', parsed.data.mortgageId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; property_id: string; original_loan_pence: string | number }>()
  if (mortgageErr) return { ok: false, error: mortgageErr.message }
  if (!mortgage) return { ok: false, error: 'Mortgage not found in your organisation.' }

  const { data: eventRow, error: eventErr } = await sb
    .from('mortgage_events')
    .insert({
      mortgage_id: parsed.data.mortgageId,
      event_date: toIso(parsed.data.eventDate),
      kind: parsed.data.kind,
      amount_pence: parsed.data.amountPence?.toString() ?? null,
      rate_post_bps: parsed.data.ratePostBps,
      balance_pence: parsed.data.balancePence?.toString() ?? null,
      notes: parsed.data.notes,
    })
    .select('id')
    .single<{ id: string }>()

  if (eventErr) return { ok: false, error: eventErr.message }
  if (!eventRow) return { ok: false, error: 'No event row returned' }

  // Re-derive balance from full ledger.
  const { data: rawEvents } = await sb
    .from('mortgage_events')
    .select('event_date, kind, amount_pence, rate_post_bps, balance_pence')
    .eq('mortgage_id', parsed.data.mortgageId)
    .order('event_date', { ascending: true })

  const events: MortgageEventLike[] = ((rawEvents ?? []) as Array<{
    event_date: string
    kind: string
    amount_pence: string | number | null
    rate_post_bps: number | null
    balance_pence: string | number | null
  }>).map((e) => ({
    eventDate: e.event_date,
    kind: e.kind,
    ratePostBps: e.rate_post_bps,
    amountPence: e.amount_pence === null ? null : BigInt(typeof e.amount_pence === 'string' ? e.amount_pence : Math.round(e.amount_pence)),
    balancePence: e.balance_pence === null ? null : BigInt(typeof e.balance_pence === 'string' ? e.balance_pence : Math.round(e.balance_pence)),
  }))

  const newBalance = deriveBalancePence(
    BigInt(typeof mortgage.original_loan_pence === 'string'
      ? mortgage.original_loan_pence
      : Math.round(mortgage.original_loan_pence)),
    events,
  )

  // Write the derived balance back to the column.
  await sb
    .from('mortgages')
    .update({
      current_balance_pence: newBalance.toString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.mortgageId)
    .eq('organisation_id', auth.organisationId)

  revalidatePath('/mortgages')
  revalidatePath(`/mortgages/${parsed.data.mortgageId}`)
  revalidatePath(`/properties/${mortgage.property_id}`)

  return {
    ok: true,
    data: { eventId: eventRow.id, newBalancePence: newBalance.toString() },
  }
}

// Manual reconciliation — writes both the balance column AND an event
// row of kind 'reconciliation' so the ledger remains the source of truth.
export async function setCurrentBalance(
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = SetCurrentBalanceSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  const { data: mortgage } = await sb
    .from('mortgages')
    .select('id, property_id')
    .eq('id', parsed.data.mortgageId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; property_id: string }>()
  if (!mortgage) return { ok: false, error: 'Mortgage not found in your organisation.' }

  const { error: eventErr } = await sb.from('mortgage_events').insert({
    mortgage_id: parsed.data.mortgageId,
    event_date: toIso(parsed.data.asOf),
    kind: 'reconciliation',
    balance_pence: parsed.data.balancePence.toString(),
    notes: `Manual reconciliation: ${parsed.data.source}`,
  })
  if (eventErr) return { ok: false, error: eventErr.message }

  const { error: updateErr } = await sb
    .from('mortgages')
    .update({
      current_balance_pence: parsed.data.balancePence.toString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.mortgageId)
    .eq('organisation_id', auth.organisationId)
  if (updateErr) return { ok: false, error: updateErr.message }

  revalidatePath(`/mortgages/${parsed.data.mortgageId}`)
  revalidatePath(`/properties/${mortgage.property_id}`)
  return { ok: true, data: undefined }
}
