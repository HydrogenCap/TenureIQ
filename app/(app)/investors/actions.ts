// app/(app)/investors/actions.ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { canCreateInvestor } from '@/lib/billing/can'
import { supabaseServer } from '@/lib/db/user'
import { closeInvestorAccountTx } from '@/lib/jobs/close-investor-account-tx'
import {
  InvestorCreateSchema,
  OpenAccountSchema,
  CloseAccountSchema,
  RecordInvestorTxSchema,
  type InvestorCreate,
} from '@/lib/schemas/investor'
import type { ActionResult } from '@/lib/types/action-result'

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10)
}

function investorRow(input: InvestorCreate) {
  return {
    name: input.name,
    kind: input.kind,
    contact_email: input.contactEmail,
    contact_phone: input.contactPhone,
    address_line_1: input.addressLine1,
    address_line_2: input.addressLine2,
    city: input.city,
    postcode: input.postcode,
    country: input.country,
    tax_id: input.taxId,
    date_of_birth: toIso(input.dateOfBirth),
    national_id_kind: input.nationalIdKind,
    notes: input.notes,
  }
}

export async function createInvestor(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  // Plan-gate: Investor module requires pro+.
  const gate = await canCreateInvestor(auth.organisationId)
  if (!gate.ok) {
    return {
      ok: false,
      error: gate.message,
      fieldErrors: gate.upgradeTo
        ? { _plan: [`Upgrade to ${gate.upgradeTo}`] }
        : undefined,
    }
  }

  const parsed = InvestorCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('investors')
    .insert({ organisation_id: auth.organisationId, ...investorRow(parsed.data) })
    .select('id')
    .single<{ id: string }>()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'no row returned' }

  revalidatePath('/investors')
  return { ok: true, data: { id: data.id } }
}

export async function updateInvestor(
  id: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = InvestorCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const sb = await supabaseServer()
  const { error } = await sb
    .from('investors')
    .update({ ...investorRow(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/investors')
  revalidatePath(`/investors/${id}`)
  return { ok: true, data: undefined }
}

export async function archiveInvestor(id: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) return { ok: false, error: auth.error }
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) return { ok: false, error: 'Invalid id' }

  const sb = await supabaseServer()
  // Refuse archive if open accounts exist — they need closing first.
  const { data: openAccounts } = await sb
    .from('investor_capital_accounts')
    .select('id')
    .eq('investor_id', idParsed.data)
    .eq('organisation_id', auth.organisationId)
    .eq('status', 'open')
    .is('deleted_at', null)
    .limit(1)
  if (openAccounts && openAccounts.length > 0) {
    return {
      ok: false,
      error: 'Investor has open capital accounts. Close them before archiving.',
    }
  }
  const { error } = await sb
    .from('investors')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', idParsed.data)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/investors')
  return { ok: true, data: undefined }
}

// =========================================================================
// Capital accounts
// =========================================================================

export async function openAccount(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }
  const parsed = OpenAccountSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const sb = await supabaseServer()
  // Ownership: both investor + entity must belong to the caller's org.
  const { data: investor } = await sb
    .from('investors')
    .select('id')
    .eq('id', parsed.data.investorId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!investor) {
    return {
      ok: false,
      error: 'Investor not found in your organisation.',
      fieldErrors: { investorId: ['Not found'] },
    }
  }
  const { data: entity } = await sb
    .from('entities')
    .select('id')
    .eq('id', parsed.data.entityId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!entity) {
    return {
      ok: false,
      error: 'Entity not found in your organisation.',
      fieldErrors: { entityId: ['Not found'] },
    }
  }
  const { data, error } = await sb
    .from('investor_capital_accounts')
    .insert({
      organisation_id: auth.organisationId,
      investor_id: parsed.data.investorId,
      entity_id: parsed.data.entityId,
      kind: parsed.data.kind,
      terms: parsed.data.terms,
      commitment_pence: parsed.data.commitmentPence.toString(),
      start_date: toIso(parsed.data.startDate),
      status: 'open',
    })
    .select('id')
    .single<{ id: string }>()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'no row returned' }
  revalidatePath('/investors')
  revalidatePath(`/investors/${parsed.data.investorId}`)
  return { ok: true, data: { id: data.id } }
}

export async function closeAccount(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }
  const parsed = CloseAccountSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  // Transactional via close_investor_account_rpc. Locks the account
  // row, refuses if not currently open, writes the (sign-flipped)
  // redemption transaction, and flips status='closed' in one
  // transaction. The previous two-step JS sequence could leave the
  // account 'open' with a balance-zeroing redemption row if the status
  // flip failed after the ledger insert.
  const txResult = await closeInvestorAccountTx({
    organisationId: auth.organisationId,
    accountId: parsed.data.accountId,
    redemptionAmountPence: parsed.data.redemptionAmountPence,
    redemptionDate: parsed.data.redemptionDate,
    linkedTransactionId: parsed.data.linkedTransactionId,
    notes: parsed.data.notes ?? 'Redemption on account closure',
  })
  if (!txResult.ok) {
    return { ok: false, error: `Account close failed: ${txResult.error}` }
  }

  revalidatePath('/investors')
  return { ok: true, data: undefined }
}

// =========================================================================
// Transactions (contribution / distribution / accrual / fee)
// =========================================================================

export async function recordInvestorTransaction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }
  const parsed = RecordInvestorTxSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  // Sign-convention sanity: contribution / interest_accrual / adjustment
  // must be POSITIVE; distribution / fee / redemption must be NEGATIVE.
  const positiveKinds = new Set(['contribution', 'interest_accrual', 'adjustment'])
  const negativeKinds = new Set(['distribution', 'fee', 'redemption'])
  if (positiveKinds.has(parsed.data.kind) && parsed.data.amountPence < 0n) {
    return {
      ok: false,
      error: `${parsed.data.kind} amount must be positive.`,
      fieldErrors: { amountPence: ['Must be positive for this kind'] },
    }
  }
  if (negativeKinds.has(parsed.data.kind) && parsed.data.amountPence > 0n) {
    return {
      ok: false,
      error: `${parsed.data.kind} amount must be negative (money leaving the account).`,
      fieldErrors: { amountPence: ['Must be negative for this kind'] },
    }
  }

  const sb = await supabaseServer()
  // Ownership: the account must belong to the caller's org and be open.
  const { data: account } = await sb
    .from('investor_capital_accounts')
    .select('id, investor_id, status')
    .eq('id', parsed.data.accountId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; investor_id: string; status: string }>()
  if (!account) {
    return {
      ok: false,
      error: 'Account not found in your organisation.',
    }
  }
  if (account.status !== 'open' && parsed.data.kind !== 'adjustment') {
    return {
      ok: false,
      error: 'Account is not open. Only `adjustment` can be recorded.',
    }
  }

  const { data, error } = await sb
    .from('investor_transactions')
    .insert({
      organisation_id: auth.organisationId,
      account_id: parsed.data.accountId,
      kind: parsed.data.kind,
      transaction_date: toIso(parsed.data.transactionDate),
      amount_pence: parsed.data.amountPence.toString(),
      linked_transaction_id: parsed.data.linkedTransactionId,
      source_document_id: parsed.data.sourceDocumentId,
      notes: parsed.data.notes,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'no row returned' }

  revalidatePath(`/investors/${account.investor_id}`)
  revalidatePath(`/investors/accounts/${parsed.data.accountId}`)
  return { ok: true, data: { id: data.id } }
}
