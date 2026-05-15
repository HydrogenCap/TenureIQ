// app/(app)/bank-accounts/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import {
  BankAccountCreateSchema,
  BankAccountUpdateSchema,
  type BankAccountCreate,
} from '@/lib/schemas/bank-account'
import type { ActionResult } from '@/lib/types/action-result'

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rowFromInput(input: BankAccountCreate) {
  return {
    entity_id: input.entityId,
    label: input.label,
    bank_name: input.bankName,
    kind: input.kind,
    sort_code_masked: input.sortCode,
    account_number_last4: input.accountNumberLast4,
    opening_balance_pence: input.openingBalancePence.toString(),
    opening_balance_date: toIso(input.openingBalanceDate),
    notes: input.notes,
  }
}

async function assertEntityOwnership(
  entityId: string,
  organisationId: string,
): Promise<string | null> {
  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('entities')
    .select('id')
    .eq('id', entityId)
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return error.message
  if (!data) return 'Entity not found in your organisation.'
  return null
}

export async function createBankAccount(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = BankAccountCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const ownershipError = await assertEntityOwnership(parsed.data.entityId, auth.organisationId)
  if (ownershipError) {
    return { ok: false, error: ownershipError, fieldErrors: { entityId: [ownershipError] } }
  }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('bank_accounts')
    .insert({ organisation_id: auth.organisationId, ...rowFromInput(parsed.data) })
    .select('id')
    .single<{ id: string }>()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No row returned' }

  revalidatePath('/bank-accounts')
  return { ok: true, data: { id: data.id } }
}

export async function updateBankAccount(
  id: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = BankAccountUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const ownershipError = await assertEntityOwnership(parsed.data.entityId, auth.organisationId)
  if (ownershipError) {
    return { ok: false, error: ownershipError, fieldErrors: { entityId: [ownershipError] } }
  }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('bank_accounts')
    .update({ ...rowFromInput(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/bank-accounts')
  revalidatePath(`/bank-accounts/${id}`)
  return { ok: true, data: undefined }
}

export async function archiveBankAccount(id: string): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('bank_accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/bank-accounts')
  return { ok: true, data: undefined }
}
