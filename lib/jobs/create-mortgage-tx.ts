// lib/jobs/create-mortgage-tx.ts
// Service-role wrapper around create_mortgage_rpc. Combines mortgage
// insert + drawdown-event seed in one transaction so a failure of
// either step rolls back both (the previous JS sequence could leave
// a mortgage with no ledger entry).

import 'server-only'
import { supabaseService } from '@/lib/db/admin'

export type CreateMortgageTxInput = {
  organisationId: string
  propertyId: string
  lender: string
  accountRef: string | null
  originalLoanPence: bigint
  currentBalancePence: bigint
  interestRateBps: number
  monthlyPaymentPence: bigint
  product: string
  fixedEndDate: Date | null
  termMonths: number
  isInterestOnly: boolean
  broker: string | null
  notes: string | null
  drawdownDate: Date
}

export type CreateMortgageTxResult =
  | { ok: true; mortgageId: string }
  | { ok: false; error: string }

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10)
}

export async function createMortgageTx(
  input: CreateMortgageTxInput,
): Promise<CreateMortgageTxResult> {
  const sb = supabaseService()
  const { data, error } = await sb.rpc('create_mortgage_rpc', {
    p_organisation_id: input.organisationId,
    p_property_id: input.propertyId,
    p_lender: input.lender,
    p_account_ref: input.accountRef,
    p_original_loan_pence: input.originalLoanPence.toString(),
    p_current_balance_pence: input.currentBalancePence.toString(),
    p_interest_rate_bps: input.interestRateBps,
    p_monthly_payment_pence: input.monthlyPaymentPence.toString(),
    p_product: input.product,
    p_fixed_end_date: toIso(input.fixedEndDate),
    p_term_months: input.termMonths,
    p_is_interest_only: input.isInterestOnly,
    p_broker: input.broker,
    p_notes: input.notes,
    p_drawdown_date: toIso(input.drawdownDate),
  })
  if (error) return { ok: false, error: error.message }
  if (typeof data !== 'string') {
    return { ok: false, error: 'create_mortgage_rpc returned no id' }
  }
  return { ok: true, mortgageId: data }
}
