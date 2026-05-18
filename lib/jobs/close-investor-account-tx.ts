// lib/jobs/close-investor-account-tx.ts
// Service-role wrapper around close_investor_account_rpc. Combines the
// redemption-transaction insert + status flip in one transaction so a
// failure of either step rolls back both.

import 'server-only'
import { supabaseService } from '@/lib/db/admin'

export type CloseInvestorAccountTxInput = {
  organisationId: string
  accountId: string
  redemptionAmountPence: bigint
  redemptionDate: Date
  linkedTransactionId: string | null
  notes: string | null
}

export type CloseInvestorAccountTxResult =
  | { ok: true; transactionId: string }
  | { ok: false; error: string }

export async function closeInvestorAccountTx(
  input: CloseInvestorAccountTxInput,
): Promise<CloseInvestorAccountTxResult> {
  const sb = supabaseService()
  const { data, error } = await sb.rpc('close_investor_account_rpc', {
    p_organisation_id: input.organisationId,
    p_account_id: input.accountId,
    p_redemption_amount_pence: input.redemptionAmountPence.toString(),
    p_redemption_date: input.redemptionDate.toISOString().slice(0, 10),
    p_linked_transaction_id: input.linkedTransactionId,
    p_notes: input.notes,
  })
  if (error) return { ok: false, error: error.message }
  if (typeof data !== 'string') {
    return { ok: false, error: 'close_investor_account_rpc returned no id' }
  }
  return { ok: true, transactionId: data }
}
