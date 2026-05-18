// lib/reports/investor-capital-statement/fetch.ts

import { supabaseServer } from '@/lib/db/user'
import {
  xirrBps,
  pendingPreferredReturnPence,
  currentBalancePence,
} from '@/lib/domain/investor'
import type { InvestorStatementData, InvestorStatementTx } from './types'

type AccountDbRow = {
  id: string
  organisation_id: string
  investor_id: string
  entity_id: string
  kind: string
  status: string
  terms: Record<string, unknown> | null
  commitment_pence: string | number
  start_date: string
  investor: Array<{ name: string; kind: string }>
  entity: Array<{ name: string }>
}

type TxDbRow = {
  id: string
  account_id: string
  kind: string
  transaction_date: string
  amount_pence: string | number
  notes: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export async function fetchInvestorCapitalStatement(input: {
  organisationId: string
  accountId: string
  from: Date
  to: Date
}): Promise<InvestorStatementData | null> {
  const sb = await supabaseServer()
  const [orgRes, accountRes, txRes] = await Promise.all([
    sb
      .from('organisations')
      .select('name')
      .eq('id', input.organisationId)
      .single<{ name: string }>(),
    sb
      .from('investor_capital_accounts')
      .select(
        'id, organisation_id, investor_id, entity_id, kind, status, terms, commitment_pence, start_date, investor:investors(name, kind), entity:entities(name)',
      )
      .eq('id', input.accountId)
      .eq('organisation_id', input.organisationId)
      .is('deleted_at', null)
      .maybeSingle<AccountDbRow>(),
    sb
      .from('investor_transactions')
      .select('id, account_id, kind, transaction_date, amount_pence, notes')
      .eq('account_id', input.accountId)
      .eq('organisation_id', input.organisationId)
      .is('deleted_at', null)
      .order('transaction_date'),
  ])

  const account = accountRes.data
  if (!account) return null
  const allTxs = (txRes.data ?? []) as TxDbRow[]

  // Walk the ledger three times — before / within / through-end-of-
  // period — so the period summary lines up with what the investor
  // sees on the screen.
  const beforePeriod = allTxs.filter(
    (t) => new Date(t.transaction_date) < input.from,
  )
  const inPeriod = allTxs.filter((t) => {
    const d = new Date(t.transaction_date)
    return d >= input.from && d <= input.to
  })
  const upToTo = allTxs.filter(
    (t) => new Date(t.transaction_date) <= input.to,
  )

  const openingPence = currentBalancePence(
    beforePeriod.map((t) => ({
      transactionDate: t.transaction_date,
      amountPence: toBig(t.amount_pence),
    })),
    input.from,
  )

  let contributionsPence = 0n
  let distributionsPence = 0n
  let accrualsPence = 0n
  let feesPence = 0n
  for (const t of inPeriod) {
    const amt = toBig(t.amount_pence)
    switch (t.kind) {
      case 'contribution':
        contributionsPence += amt
        break
      case 'distribution':
        distributionsPence += amt // negative
        break
      case 'interest_accrual':
        accrualsPence += amt
        break
      case 'fee':
        feesPence += amt // negative
        break
      case 'redemption':
        distributionsPence += amt
        break
    }
  }

  const closingPence = currentBalancePence(
    upToTo.map((t) => ({
      transactionDate: t.transaction_date,
      amountPence: toBig(t.amount_pence),
    })),
    input.to,
  )

  // XIRR — sign-flipped (investor POV: contribute = negative cashflow).
  const irrBps = xirrBps(
    upToTo.map((t) => ({
      date: t.transaction_date,
      amountPence: -toBig(t.amount_pence),
    })),
  )

  const termsBps =
    typeof account.terms?.preferred_return_bps === 'number'
      ? (account.terms.preferred_return_bps as number)
      : 0
  const totalContributedToDate = beforePeriod
    .concat(inPeriod)
    .filter((t) => t.kind === 'contribution')
    .reduce((s, t) => s + toBig(t.amount_pence), 0n)
  const daysAccruing = Math.max(
    0,
    Math.floor(
      (input.to.getTime() - new Date(account.start_date).getTime()) / 86_400_000,
    ),
  )
  const pendingPref =
    account.kind === 'preferred_equity'
      ? pendingPreferredReturnPence({
          contributedToDatePence: totalContributedToDate,
          preferredReturnBps: termsBps,
          daysAccruing,
        })
      : 0n

  const ledger: InvestorStatementTx[] = inPeriod.map((t) => ({
    id: t.id,
    date: t.transaction_date,
    kind: t.kind,
    amountPence: toBig(t.amount_pence),
    notes: t.notes,
  }))

  return {
    organisationName: orgRes.data?.name ?? 'Investor statement',
    asOf: new Date(),
    period: { from: input.from, to: input.to },
    investorName: account.investor?.[0]?.name ?? '—',
    investorKind: account.investor?.[0]?.kind ?? '—',
    entityName: account.entity?.[0]?.name ?? '—',
    accountKind: account.kind,
    accountStatus: account.status,
    openingBalancePence: openingPence,
    contributionsPence,
    distributionsPence,
    accrualsPence,
    feesPence,
    closingBalancePence: closingPence,
    commitmentPence: toBig(account.commitment_pence),
    xirrBps: irrBps,
    pendingPreferredReturnPence: pendingPref,
    preferredReturnBps: termsBps > 0 ? termsBps : null,
    ledger,
  }
}
