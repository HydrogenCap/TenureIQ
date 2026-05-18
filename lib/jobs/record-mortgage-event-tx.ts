// lib/jobs/record-mortgage-event-tx.ts
// Service-role wrapper around record_mortgage_event_rpc. Locks the
// mortgage row before re-deriving balance from the ledger, so two
// concurrent payments serialise instead of racing.

import 'server-only'
import { supabaseService } from '@/lib/db/admin'

export type RecordMortgageEventTxInput = {
  organisationId: string
  mortgageId: string
  kind: string
  eventDate: Date
  amountPence: bigint | null
  ratePostBps: number | null
  balancePence: bigint | null
  notes: string | null
}

export type RecordMortgageEventTxResult =
  | { ok: true; eventId: string; newBalancePence: bigint }
  | { ok: false; error: string }

export async function recordMortgageEventTx(
  input: RecordMortgageEventTxInput,
): Promise<RecordMortgageEventTxResult> {
  const sb = supabaseService()
  const { data, error } = await sb.rpc('record_mortgage_event_rpc', {
    p_organisation_id: input.organisationId,
    p_mortgage_id: input.mortgageId,
    p_kind: input.kind,
    p_event_date: input.eventDate.toISOString().slice(0, 10),
    p_amount_pence: input.amountPence?.toString() ?? null,
    p_rate_post_bps: input.ratePostBps,
    p_balance_pence: input.balancePence?.toString() ?? null,
    p_notes: input.notes,
  })
  if (error) return { ok: false, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object' || !('event_id' in row)) {
    return { ok: false, error: 'record_mortgage_event_rpc returned no row' }
  }
  return {
    ok: true,
    eventId: (row as { event_id: string }).event_id,
    newBalancePence: BigInt((row as { new_balance_pence: string | number }).new_balance_pence),
  }
}
