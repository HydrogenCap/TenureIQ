// app/(app)/mortgages/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { createMortgageTx } from '@/lib/jobs/create-mortgage-tx'
import { recordMortgageEventTx } from '@/lib/jobs/record-mortgage-event-tx'
import {
  MortgageCreateSchema,
  MortgageUpdateSchema,
  RecordMortgageEventSchema,
  SetCurrentBalanceSchema,
} from '@/lib/schemas/mortgage'
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

  // Transactional via create_mortgage_rpc — mortgage insert + drawdown
  // event are wrapped in a single Postgres transaction; failure of
  // either rolls back both. Replaces the compensating-soft-delete
  // pattern from the M4 review-fix commit.
  const txResult = await createMortgageTx({
    organisationId: auth.organisationId,
    propertyId: parsed.data.propertyId,
    lender: parsed.data.lender,
    accountRef: parsed.data.accountRef,
    originalLoanPence: parsed.data.originalLoanPence,
    currentBalancePence: parsed.data.currentBalancePence,
    interestRateBps: parsed.data.interestRateBps,
    monthlyPaymentPence: parsed.data.monthlyPaymentPence,
    product: parsed.data.product,
    fixedEndDate: parsed.data.fixedEndDate,
    termMonths: parsed.data.termMonths,
    isInterestOnly: parsed.data.isInterestOnly,
    broker: parsed.data.broker,
    notes: parsed.data.notes,
    drawdownDate: new Date(),
  })
  if (!txResult.ok) {
    return { ok: false, error: `Mortgage creation failed: ${txResult.error}` }
  }

  revalidatePath('/mortgages')
  revalidatePath(`/properties/${parsed.data.propertyId}`)
  return { ok: true, data: { id: txResult.mortgageId } }
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

  // Property_id lookup for revalidate (one read; the RPC handles the
  // rest under a row-level lock).
  const { data: mortgage, error: mortgageErr } = await sb
    .from('mortgages')
    .select('property_id')
    .eq('id', parsed.data.mortgageId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ property_id: string }>()
  if (mortgageErr) return { ok: false, error: mortgageErr.message }
  if (!mortgage) return { ok: false, error: 'Mortgage not found in your organisation.' }

  // Transactional via record_mortgage_event_rpc. The function takes a
  // FOR UPDATE lock on the mortgage row BEFORE reading the ledger,
  // serialising concurrent payments. The event insert + ledger walk +
  // balance write all run in one transaction.
  const txResult = await recordMortgageEventTx({
    organisationId: auth.organisationId,
    mortgageId: parsed.data.mortgageId,
    kind: parsed.data.kind,
    eventDate: parsed.data.eventDate,
    amountPence: parsed.data.amountPence,
    ratePostBps: parsed.data.ratePostBps,
    balancePence: parsed.data.balancePence,
    notes: parsed.data.notes,
  })
  if (!txResult.ok) {
    return { ok: false, error: `Event record failed: ${txResult.error}` }
  }

  revalidatePath('/mortgages')
  revalidatePath(`/mortgages/${parsed.data.mortgageId}`)
  revalidatePath(`/properties/${mortgage.property_id}`)

  return {
    ok: true,
    data: {
      eventId: txResult.eventId,
      newBalancePence: txResult.newBalancePence.toString(),
    },
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
