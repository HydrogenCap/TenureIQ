// app/(app)/transactions/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import {
  TransactionCreateSchema,
  TransactionUpdateSchema,
  RecategoriseSchema,
  BulkRecategoriseSchema,
  type TransactionCreate,
} from '@/lib/schemas/transaction'
import type { ActionResult } from '@/lib/types/action-result'

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rowFromInput(input: TransactionCreate) {
  return {
    bank_account_id: input.bankAccountId,
    property_id: input.propertyId,
    posted_at: toIso(input.postedAt),
    description: input.description,
    amount_pence: input.amountPence.toString(),
    category_code: input.categoryCode,
    reference: input.reference,
  }
}

// Defence-in-depth ownership check. RLS catches the cross-org case at
// the DB layer but we fail closed earlier here.
async function assertPropertyOwnership(
  sb: Awaited<ReturnType<typeof supabaseServer>>,
  propertyId: string,
  organisationId: string,
): Promise<string | null> {
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

async function assertBankAccountOwnership(
  sb: Awaited<ReturnType<typeof supabaseServer>>,
  bankAccountId: string,
  organisationId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from('bank_accounts')
    .select('id')
    .eq('id', bankAccountId)
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return error.message
  if (!data) return 'Bank account not found in your organisation.'
  return null
}

export async function createTransaction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = TransactionCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  if (parsed.data.propertyId) {
    const err = await assertPropertyOwnership(sb, parsed.data.propertyId, auth.organisationId)
    if (err) return { ok: false, error: err, fieldErrors: { propertyId: [err] } }
  }
  if (parsed.data.bankAccountId) {
    const err = await assertBankAccountOwnership(sb, parsed.data.bankAccountId, auth.organisationId)
    if (err) return { ok: false, error: err, fieldErrors: { bankAccountId: [err] } }
  }

  const { data, error } = await sb
    .from('transactions')
    .insert({ organisation_id: auth.organisationId, ...rowFromInput(parsed.data) })
    .select('id')
    .single<{ id: string }>()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No row returned' }

  revalidatePath('/transactions')
  if (parsed.data.bankAccountId) {
    revalidatePath(`/bank-accounts/${parsed.data.bankAccountId}`)
  }
  return { ok: true, data: { id: data.id } }
}

export async function updateTransaction(
  id: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = TransactionUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  if (parsed.data.propertyId) {
    const err = await assertPropertyOwnership(sb, parsed.data.propertyId, auth.organisationId)
    if (err) return { ok: false, error: err, fieldErrors: { propertyId: [err] } }
  }

  const { error } = await sb
    .from('transactions')
    .update({ ...rowFromInput(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/transactions')
  revalidatePath(`/transactions/${id}`)
  return { ok: true, data: undefined }
}

export async function archiveTransaction(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/transactions')
  return { ok: true, data: undefined }
}

export async function recategoriseTransaction(
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = RecategoriseSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  if (parsed.data.propertyId) {
    const err = await assertPropertyOwnership(sb, parsed.data.propertyId, auth.organisationId)
    if (err) return { ok: false, error: err }
  }

  const { error: updateErr } = await sb
    .from('transactions')
    .update({
      category_code: parsed.data.categoryCode,
      property_id: parsed.data.propertyId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.transactionId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  if (updateErr) return { ok: false, error: updateErr.message }

  // Optionally seed a category rule for future imports.
  if (parsed.data.createRule && parsed.data.rulePattern) {
    const { error: ruleErr } = await sb.from('transaction_category_rules').insert({
      organisation_id: auth.organisationId,
      pattern: parsed.data.rulePattern,
      is_regex: parsed.data.rulePattern.startsWith('/') && parsed.data.rulePattern.lastIndexOf('/') > 0,
      category_code: parsed.data.categoryCode,
      property_id: parsed.data.propertyId,
      sign_required: null,
    })
    if (ruleErr) {
      // Non-fatal: the recategorisation already landed.
      return {
        ok: false,
        error: `Categorised, but rule could not be saved: ${ruleErr.message}`,
      }
    }
  }

  revalidatePath('/transactions')
  revalidatePath(`/transactions/${parsed.data.transactionId}`)
  return { ok: true, data: undefined }
}

export async function bulkRecategoriseTransactions(
  input: unknown,
): Promise<ActionResult<{ updated: number }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = BulkRecategoriseSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  if (parsed.data.propertyId) {
    const err = await assertPropertyOwnership(sb, parsed.data.propertyId, auth.organisationId)
    if (err) return { ok: false, error: err }
  }

  const { error } = await sb
    .from('transactions')
    .update({
      category_code: parsed.data.categoryCode,
      property_id: parsed.data.propertyId,
      updated_at: new Date().toISOString(),
    })
    .in('id', parsed.data.transactionIds)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/transactions')
  return { ok: true, data: { updated: parsed.data.transactionIds.length } }
}
