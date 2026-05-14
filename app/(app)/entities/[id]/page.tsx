// app/(app)/entities/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { EntityHeader } from '../_components/entity-header'
import { EntityKpis } from '../_components/entity-kpis'
import { Tabs, type TabDef } from '@/components/ui/tabs'
import { EmptyState } from '@/components/empty-state'
import Link from 'next/link'
import { multiplyByBps } from '@/lib/money'

const TABS: TabDef[] = [
  { tabKey: 'overview', label: 'Overview' },
  { tabKey: 'properties', label: 'Properties' },
  { tabKey: 'shareholders', label: 'Shareholders' },
  { tabKey: 'banking', label: 'Banking' },
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
        <EmptyState
          title="Shareholders"
          description="Available in M11 — investor reporting."
        />
      )}

      {activeTab === 'banking' && (
        <EmptyState
          title="Banking"
          description="Available in M5 — transactions & bank reconciliation."
        />
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
