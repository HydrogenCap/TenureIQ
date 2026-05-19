// app/(app)/entities/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { EntityHeader } from '../_components/entity-header'
import { EntityKpis } from '../_components/entity-kpis'
import { Tabs, type TabDef } from '@/components/ui/tabs'
import { EmptyState } from '@/components/empty-state'
import Link from 'next/link'
import { Suspense } from 'react'
import { MoneyDisplay } from '@/components/money-display'
import { StatusBadge } from '@/components/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { EntityPandL } from './_components/entity-pandl'
import { ShareholdersTab, type ShareholderVm } from './_components/shareholders-tab'
import { DirectorLoansTab, type DirectorLoanRowVm } from './_components/director-loans-tab'

const TABS: TabDef[] = [
  { tabKey: 'overview', label: 'Overview' },
  { tabKey: 'properties', label: 'Properties' },
  { tabKey: 'shareholders', label: 'Shareholders' },
  { tabKey: 'bank-accounts', label: 'Bank accounts' },
  { tabKey: 'director-loans', label: 'Director loans' },
  { tabKey: 'pandl', label: 'P&L' },
]

export default async function EntityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams

  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data: entity } = await sb
    .from('entities')
    .select(
      'id, name, kind, companies_house_number, registered_address, hmrc_utr, vat_number, year_end_month, year_end_day, notes, deleted_at, created_at',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .maybeSingle<{
      id: string
      name: string
      kind: string
      companies_house_number: string | null
      registered_address: string | null
      hmrc_utr: string | null
      vat_number: string | null
      year_end_month: number | null
      year_end_day: number | null
      notes: string | null
      deleted_at: string | null
      created_at: string
    }>()

  if (!entity) notFound()

  const { data: rawProperties } = await sb
    .from('properties')
    .select('id, purchase_price_pence, current_valuation_pence, address_line_1, postcode, kind')
    .eq('entity_id', id)
    .is('deleted_at', null)

  const properties = (rawProperties ?? []) as Array<{
    id: string
    purchase_price_pence: string | number
    current_valuation_pence: string | number | null
    address_line_1: string
    postcode: string
    kind: string
  }>

  const propertyIds = properties.map((p) => p.id)
  let totalDebtPence = 0n
  let weightedLtvBps: number | null = null
  let portfolioValuePence = 0n

  for (const p of properties) {
    const v = p.current_valuation_pence ?? p.purchase_price_pence
    portfolioValuePence += BigInt(typeof v === 'string' ? v : Math.round(v))
  }

  if (propertyIds.length > 0) {
    const { data: rawMortgages } = await sb
      .from('mortgages')
      .select('property_id, current_balance_pence')
      .in('property_id', propertyIds)
      .is('deleted_at', null)

    const mortgages = (rawMortgages ?? []) as Array<{
      property_id: string
      current_balance_pence: string | number
    }>

    for (const m of mortgages) {
      totalDebtPence += BigInt(
        typeof m.current_balance_pence === 'string'
          ? m.current_balance_pence
          : Math.round(m.current_balance_pence),
      )
    }

    if (portfolioValuePence > 0n) {
      weightedLtvBps = Number((totalDebtPence * 10000n) / portfolioValuePence)
    }
  }

  const canManage =
    auth.ok && (auth.role === 'owner' || auth.role === 'admin' || auth.role === 'manager')
  const canRestore = auth.ok && (auth.role === 'owner' || auth.role === 'admin')
  const canDeleteShareholder = auth.ok && (auth.role === 'owner' || auth.role === 'admin')

  // Shareholders + bank accounts for the respective tabs. Fetched up-
  // front (rather than lazy per-tab) so a deep-link to ?tab=shareholders
  // renders the data in one round-trip.
  const { data: rawShareholders } = await sb
    .from('shareholders')
    .select('id, name, share_count, share_class, is_director, appointed_date, resigned_date')
    .eq('entity_id', id)
    .order('resigned_date', { ascending: true, nullsFirst: true })
    .order('name')
  const shareholders: ShareholderVm[] = ((rawShareholders ?? []) as Array<{
    id: string
    name: string
    share_count: number
    share_class: string
    is_director: boolean
    appointed_date: string | null
    resigned_date: string | null
  }>).map((s) => ({
    id: s.id,
    name: s.name,
    shareCount: s.share_count,
    shareClass: s.share_class,
    isDirector: s.is_director,
    appointedDate: s.appointed_date,
    resignedDate: s.resigned_date,
  }))

  const { data: rawDirectorLoans } = await sb
    .from('director_loans')
    .select('id, director_name, kind, event_date, amount_pence, description')
    .eq('entity_id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('event_date', { ascending: false })
  const directorLoans: DirectorLoanRowVm[] = ((rawDirectorLoans ?? []) as Array<{
    id: string
    director_name: string
    kind: string
    event_date: string
    amount_pence: string | number
    description: string | null
  }>).map((r) => ({
    id: r.id,
    directorName: r.director_name,
    kind: r.kind,
    eventDate: r.event_date,
    amountPence: BigInt(
      typeof r.amount_pence === 'string' ? r.amount_pence : Math.round(r.amount_pence),
    ),
    description: r.description,
  }))

  const { data: rawBankAccounts } = await sb
    .from('bank_accounts')
    .select('id, label, bank_name, kind, account_number_last4, sort_code_masked, opening_balance_pence')
    .eq('entity_id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('label')
  const bankAccounts = ((rawBankAccounts ?? []) as Array<{
    id: string
    label: string
    bank_name: string | null
    kind: string
    account_number_last4: string | null
    sort_code_masked: string | null
    opening_balance_pence: string | number
  }>).map((b) => ({
    id: b.id,
    label: b.label,
    bankName: b.bank_name,
    kind: b.kind,
    accountNumberLast4: b.account_number_last4,
    sortCodeMasked: b.sort_code_masked,
    openingBalancePence: BigInt(
      typeof b.opening_balance_pence === 'string'
        ? b.opening_balance_pence
        : Math.round(b.opening_balance_pence),
    ),
  }))

  const activeTab = tab ?? 'overview'

  return (
    <div className="space-y-6">
      <EntityHeader
        id={entity.id}
        name={entity.name}
        kind={entity.kind}
        archived={!!entity.deleted_at}
        canManage={canManage}
        canRestore={canRestore}
      />

      <EntityKpis
        propertyCount={properties.length}
        portfolioValuePence={portfolioValuePence}
        totalDebtPence={totalDebtPence}
        weightedLtvBps={weightedLtvBps}
      />

      <Tabs tabs={TABS} defaultTabKey="overview" />

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <DetailRow label="Companies House" rowValue={entity.companies_house_number} />
          <DetailRow label="HMRC UTR" rowValue={entity.hmrc_utr} />
          <DetailRow label="VAT number" rowValue={entity.vat_number} />
          <DetailRow
            label="Year-end"
            rowValue={
              entity.year_end_month && entity.year_end_day
                ? `${entity.year_end_day}/${entity.year_end_month}`
                : null
            }
          />
          <DetailRow
            label="Registered address"
            rowValue={entity.registered_address}
            fullWidth
          />
          <DetailRow label="Notes" rowValue={entity.notes} fullWidth />
        </div>
      )}

      {activeTab === 'properties' && (
        properties.length === 0 ? (
          <EmptyState
            title="No properties held by this entity"
            description="Add a property and assign it to this entity."
            action={
              <Link
                href="/properties/new"
                className="text-sm font-medium text-primary hover:underline"
              >
                + New property
              </Link>
            }
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {properties.map((p) => (
              <li key={p.id} className="flex items-center justify-between p-3">
                <Link href={`/properties/${p.id}`} className="font-medium hover:underline">
                  {p.address_line_1}, {p.postcode}
                </Link>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {p.kind}
                </span>
              </li>
            ))}
          </ul>
        )
      )}

      {activeTab === 'shareholders' && (
        <ShareholdersTab
          entityId={entity.id}
          initial={shareholders}
          canManage={canManage}
          canDelete={canDeleteShareholder}
        />
      )}

      {activeTab === 'bank-accounts' && (
        bankAccounts.length === 0 ? (
          <EmptyState
            title="No bank accounts on this entity"
            description="Add a bank account and assign it to this entity for reconciliation."
            action={
              canManage ? (
                <Link
                  href={`/bank-accounts/new?entityId=${entity.id}`}
                  className={buttonVariants()}
                >
                  + New bank account
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {bankAccounts.length} bank account{bankAccounts.length === 1 ? '' : 's'}
              </p>
              {canManage && (
                <Link
                  href={`/bank-accounts/new?entityId=${entity.id}`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  + Add account
                </Link>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Sort code</TableHead>
                  <TableHead>Last 4</TableHead>
                  <TableHead className="text-right">Opening balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <Link href={`/bank-accounts/${b.id}`} className="hover:underline">
                        {b.label}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{b.bankName ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={b.kind} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.sortCodeMasked ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.accountNumberLast4 ? `••${b.accountNumberLast4}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay pence={b.openingBalancePence} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {activeTab === 'director-loans' && (
        <DirectorLoansTab
          entityId={entity.id}
          initial={directorLoans}
          canManage={canManage}
          canArchive={canManage}
        />
      )}

      {activeTab === 'pandl' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Year-to-date P&amp;L across this entity's properties and any entity-level transactions.
          </p>
          <Suspense fallback={<div className="h-40 animate-pulse rounded bg-muted" />}>
            <EntityPandL entityId={entity.id} />
          </Suspense>
        </div>
      )}
    </div>
  )
}

function DetailRow({
  label,
  rowValue,
  fullWidth,
}: {
  label: string
  rowValue: string | null | undefined
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : undefined}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{rowValue ?? '—'}</p>
    </div>
  )
}
