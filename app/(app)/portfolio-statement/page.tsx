// app/(app)/portfolio-statement/page.tsx
// Investor-facing read-only portfolio statement (M11).
//
// Available to EVERY member role, including `viewer`. Pure RSC — no
// server actions, no forms, no mutation links anywhere on this page.
//
// Scoping: viewers only see capital accounts whose investor record has
// a contact_email matching their signed-in email (case-insensitive).
// owner/admin/manager/accountant see every account in the organisation.
// TODO(decision): add a first-class investors.user_id linkage column — email matching is a heuristic.

import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { MoneyDisplay } from '@/components/money-display'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { bpsToPercent } from '@/lib/money'
import {
  currentBalancePence,
  contributionsToDatePence,
  distributionsToDatePence,
  pendingPreferredReturnPence,
  xirrBps,
} from '@/lib/domain/investor'

type InvestorDbRow = {
  id: string
  name: string
  contact_email: string | null
}

type AccountDbRow = {
  id: string
  investor_id: string
  entity_id: string
  kind: string
  status: string
  terms: Record<string, unknown> | null
  commitment_pence: string | number
  start_date: string
  investor: Array<{ name: string }>
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

type AccountSummary = {
  id: string
  investorName: string
  entityName: string
  kind: string
  status: string
  commitmentPence: bigint
  contributionsPence: bigint
  distributionsPence: bigint
  balancePence: bigint
  irrBps: number | null
  preferredReturnBps: number | null
  pendingPrefPence: bigint
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

const LATEST_TX_LIMIT = 50

export const metadata = { title: 'Portfolio statement' }

export default async function PortfolioStatementPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()

  // Investor rows — needed both for names and for the viewer email match.
  const investorsRes = await sb
    .from('investors')
    .select('id, name, contact_email')
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  const investors = (investorsRes.data ?? []) as InvestorDbRow[]

  const isViewer = auth.role === 'viewer'
  let allowedInvestorIds: string[] | null = null // null = unrestricted
  if (isViewer) {
    const {
      data: { user },
    } = await sb.auth.getUser()
    const email = user?.email?.toLowerCase() ?? null
    // Compared in JS (not .ilike) so `_`/`%` in an address cannot act
    // as SQL wildcards.
    allowedInvestorIds = email
      ? investors
          .filter((i) => (i.contact_email ?? '').toLowerCase() === email)
          .map((i) => i.id)
      : []

    if (allowedInvestorIds.length === 0) {
      return (
        <div className="space-y-6">
          <PageHeader
            title="Portfolio statement"
            description="Read-only summary of investor capital accounts."
          />
          <EmptyState
            title="No investor records linked to your account"
            description="No investor record in this organisation has a contact email matching your sign-in email. Ask the portfolio manager to set your email on your investor record."
          />
        </div>
      )
    }
  }

  let accountsQuery = sb
    .from('investor_capital_accounts')
    .select(
      'id, investor_id, entity_id, kind, status, terms, commitment_pence, start_date, investor:investors(name), entity:entities(name)',
    )
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  if (allowedInvestorIds !== null) {
    accountsQuery = accountsQuery.in('investor_id', allowedInvestorIds)
  }
  const accountsRes = await accountsQuery.order('start_date')
  const accounts = (accountsRes.data ?? []) as AccountDbRow[]

  const accountIds = accounts.map((a) => a.id)
  let txs: TxDbRow[] = []
  if (accountIds.length > 0) {
    const txRes = await sb
      .from('investor_transactions')
      .select('id, account_id, kind, transaction_date, amount_pence, notes')
      .eq('organisation_id', auth.organisationId)
      .in('account_id', accountIds)
      .is('deleted_at', null)
      .order('transaction_date')
    txs = (txRes.data ?? []) as TxDbRow[]
  }

  // Group the ledger per account, then derive balances / IRR with the
  // shared domain helpers (same maths as the admin account page and the
  // capital-statement PDF — never duplicated here).
  const byAccount = new Map<string, TxDbRow[]>()
  for (const t of txs) {
    const list = byAccount.get(t.account_id)
    if (list) list.push(t)
    else byAccount.set(t.account_id, [t])
  }

  const today = new Date()
  const summaries: AccountSummary[] = accounts.map((a) => {
    const rows = byAccount.get(a.id) ?? []
    const ledger = rows.map((t) => ({
      transactionDate: t.transaction_date,
      amountPence: toBig(t.amount_pence),
    }))
    const contributions = contributionsToDatePence(ledger, today)
    const termsBps =
      typeof a.terms?.preferred_return_bps === 'number'
        ? (a.terms.preferred_return_bps as number)
        : 0
    const daysElapsed = Math.max(
      0,
      Math.floor((today.getTime() - new Date(a.start_date).getTime()) / 86_400_000),
    )
    return {
      id: a.id,
      investorName: a.investor?.[0]?.name ?? '—',
      entityName: a.entity?.[0]?.name ?? '—',
      kind: a.kind,
      status: a.status,
      commitmentPence: toBig(a.commitment_pence),
      contributionsPence: contributions,
      distributionsPence: distributionsToDatePence(ledger, today),
      balancePence: currentBalancePence(ledger, today),
      // Investor POV cashflows: contributions leave their pocket, so
      // flip the ledger sign (same convention as the account page).
      irrBps: xirrBps(
        ledger.map((t) => ({ date: t.transactionDate, amountPence: -t.amountPence })),
      ),
      preferredReturnBps: termsBps > 0 ? termsBps : null,
      pendingPrefPence:
        a.kind === 'preferred_equity' && termsBps > 0
          ? pendingPreferredReturnPence({
              contributedToDatePence: contributions,
              preferredReturnBps: termsBps,
              daysAccruing: daysElapsed,
            })
          : 0n,
    }
  })

  const accountLabel = new Map<string, string>()
  for (const s of summaries) {
    accountLabel.set(s.id, `${s.investorName} · ${s.entityName}`)
  }
  const latestTxs = [...txs]
    .sort(
      (x, y) =>
        new Date(y.transaction_date).getTime() - new Date(x.transaction_date).getTime(),
    )
    .slice(0, LATEST_TX_LIMIT)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio statement"
        description={
          isViewer
            ? 'Read-only summary of the capital accounts linked to your email.'
            : 'Read-only summary of every investor capital account in the organisation.'
        }
      />

      {summaries.length === 0 ? (
        <EmptyState
          title="No capital accounts"
          description="There are no open or closed investor capital accounts to report on yet."
        />
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-base font-medium">
              Capital accounts ({summaries.length})
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Investor</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">Contributed</TableHead>
                  <TableHead className="text-right">Distributed</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">IRR</TableHead>
                  <TableHead className="text-right">Pref return</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.investorName}</TableCell>
                    <TableCell className="text-sm">{s.entityName}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={s.kind} />
                        <StatusBadge status={s.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay pence={s.commitmentPence} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay pence={s.contributionsPence} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay pence={s.distributionsPence} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      <MoneyDisplay pence={s.balancePence} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.irrBps === null ? '—' : bpsToPercent(s.irrBps)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {s.preferredReturnBps === null ? (
                        '—'
                      ) : (
                        <>
                          {bpsToPercent(s.preferredReturnBps)}
                          <span className="block text-xs text-muted-foreground">
                            pending <MoneyDisplay pence={s.pendingPrefPence} />
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              IRR is the money-weighted, annualised return (XIRR) over each
              account&apos;s dated cashflows, as of today. Balances reflect all
              transactions up to today.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium">
              Latest transactions
              {txs.length > LATEST_TX_LIMIT ? ` (most recent ${LATEST_TX_LIMIT} of ${txs.length})` : ` (${txs.length})`}
            </h2>
            {latestTxs.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                description="Contributions and distributions will appear here once recorded."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Memo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestTxs.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">
                        <DateDisplay date={t.transaction_date} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {accountLabel.get(t.account_id) ?? '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.kind} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <MoneyDisplay pence={toBig(t.amount_pence)} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.notes ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      )}
    </div>
  )
}
