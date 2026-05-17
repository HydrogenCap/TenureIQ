// app/(app)/aasc/contracts/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import {
  AascContractCreateSchema,
  AascContractUpdateSchema,
  type AascContractCreate,
} from '@/lib/schemas/aasc'
import type { ActionResult } from '@/lib/types/action-result'

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10)
}

function rowFromInput(input: AascContractCreate) {
  return {
    entity_id: input.entityId,
    contractor: input.contractor,
    kind: input.kind,
    reference: input.reference,
    start_date: input.startDate.toISOString().slice(0, 10),
    end_date: toIso(input.endDate),
    break_clause_date: toIso(input.breakClauseDate),
    contracted_rate_pence_per_week: input.contractedRatePencePerWeek?.toString() ?? null,
    commission_rate_bps: input.commissionRateBps,
    payment_terms_days: input.paymentTermsDays,
    payable_bank_account_id: input.payableBankAccountId,
    monthly_headline_pence: input.monthlyHeadlinePence?.toString() ?? null,
    notes: input.notes,
  }
}

export async function createContract(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = AascContractCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('aasc_contracts')
    .insert({
      organisation_id: auth.organisationId,
      status: 'active',
      ...rowFromInput(parsed.data),
    })
    .select('id')
    .single<{ id: string }>()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'no row returned' }

  revalidatePath('/aasc')
  revalidatePath('/aasc/contracts')
  return { ok: true, data: { id: data.id } }
}

export async function updateContract(
  id: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = AascContractUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('aasc_contracts')
    .update({ ...rowFromInput(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/aasc/contracts/${id}`)
  revalidatePath('/aasc/contracts')
  return { ok: true, data: undefined }
}

export async function terminateContract(
  id: string,
  reason: string,
): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('aasc_contracts')
    .update({
      status: 'terminated',
      notes: reason ? `Terminated: ${reason}` : 'Terminated',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/aasc/contracts/${id}`)
  revalidatePath('/aasc/contracts')
  return { ok: true, data: undefined }
}
