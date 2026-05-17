import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { KpiTile } from '@/components/kpi-tile'
import { buttonVariants } from '@/components/ui/button'
import { ComplianceTable, type ComplianceRow } from './_components/compliance-table'
import { complianceRollup } from '@/lib/domain/compliance-rollup'

type DbRow = {
  id: string
  kind: string
  status: string
  issue_date: string | null
  expiry_date: string | null
  issuer: string | null
  property_id: string
  property: Array<{ address_line_1: string; postcode: string }>
}

const ATTENTION_STATUSES = ['expiring', 'expired', 'missing']

export default async function ComplianceListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; property?: string; showValid?: string }>
}) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const { status, kind, property, showValid } = await searchParams

  const sb = await supabaseServer()
  let query = sb
    .from('compliance_items')
    .select(
      'id, kind, status, issue_date, expiry_date, issuer, property_id, property:properties(address_line_1, postcode)',
    )
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('expiry_date', { ascending: true, nullsFirst: false })

  if (status) query = query.eq('status', status)
  if (kind) query = query.eq('kind', kind)
  if (property) query = query.eq('property_id', property)
  // Default: "active issues" view — hide valid + exempt unless `showValid` toggled.
  if (!status && !showValid) {
    query = query.in('status', ATTENTION_STATUSES)
  }

  const { data: rawRows, error } = await query
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance" />
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      </div>
    )
  }

  const dbRows = (rawRows ?? []) as DbRow[]

  // Rollup runs over ALL items (not just the filtered view), so the KPI
  // tiles reflect the whole org.
  const { data: allForRollup } = await sb
    .from('compliance_items')
    .select('id, kind, expiry_date, status')
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  const rollupItems = ((allForRollup ?? []) as Array<{
    id: string
    kind: string
    expiry_date: string | null
    status: string
  }>).map((r) => ({
    id: r.id,
    kind: r.kind,
    expiryDate: r.expiry_date,
    status: r.status,
  }))
  const rollup = complianceRollup(rollupItems)

  const rows: ComplianceRow[] = dbRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    issueDate: r.issue_date,
    expiryDate: r.expiry_date,
    issuer: r.issuer,
    propertyId: r.property_id,
    propertyAddressLine1: r.property?.[0]?.address_line_1 ?? '—',
    propertyPostcode: r.property?.[0]?.postcode ?? '',
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="Statutory + recommended certificates across your portfolio."
        actions={
          <Link href="/compliance/new" className={buttonVariants()}>
            + Record certificate
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile label="Valid" display={rollup.valid} />
        <KpiTile
          label="Expiring (≤60d)"
          display={rollup.expiring}
          trend={rollup.expiring > 0 ? 'down' : 'flat'}
        />
        <KpiTile
          label="Expired"
          display={rollup.expired}
          trend={rollup.expired > 0 ? 'down' : 'flat'}
        />
        <KpiTile label="Exempt" display={rollup.exempt} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">View:</span>
        <Link
          href="/compliance"
          className={!showValid && !status ? 'font-medium underline' : 'hover:underline'}
        >
          Active issues
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link
          href="/compliance?showValid=1"
          className={showValid ? 'font-medium underline' : 'hover:underline'}
        >
          All
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link
          href="/compliance?status=valid"
          className={status === 'valid' ? 'font-medium underline' : 'hover:underline'}
        >
          Valid only
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={
            !status && !showValid
              ? 'Nothing needs attention'
              : 'No compliance items match these filters'
          }
          description={
            !status && !showValid
              ? 'All recorded certificates are valid or exempt.'
              : undefined
          }
        />
      ) : (
        <ComplianceTable rows={rows} />
      )}

      <p className="text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'item' : 'items'} shown
      </p>
    </div>
  )
}
