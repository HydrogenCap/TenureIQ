import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { KpiTile } from '@/components/kpi-tile'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { MoneyDisplay } from '@/components/money-display'
import { bpsToPercent } from '@/lib/money'
import {
  placementGrossPerWeekPence,
  placementNetPerWeekPence,
} from '@/lib/domain/aasc-placement'
import { PlacementActionsPanel } from './_components/end-placement-panel'

type DbRow = {
  id: string
  contract_id: string | null
  property_id: string
  unit_id: string | null
  placement_ref: string
  status: string
  service_user_count: number
  weekly_rate_pence: string | number
  commission_rate_bps_override: number | null
  start_date: string
  end_date: string | null
  end_date_expected: string | null
  contract: Array<{
    id: string
    contractor: string
    reference: string | null
    commission_rate_bps: number
  }>
  property: Array<{ address_line_1: string; postcode: string }>
  unit: Array<{ label: string }>
}

type CountChangeRow = {
  id: string
  effective_from: string
  new_count: number
  reason: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function PlacementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data } = await sb
    .from('aasc_placements')
    .select(
      'id, contract_id, property_id, unit_id, placement_ref, status, service_user_count, weekly_rate_pence, commission_rate_bps_override, start_date, end_date, end_date_expected, contract:aasc_contracts(id, contractor, reference, commission_rate_bps), property:properties(address_line_1, postcode), unit:units(label)',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  const { data: rawChanges } = await sb
    .from('placement_count_changes')
    .select('id, effective_from, new_count, reason')
    .eq('placement_id', id)
    .eq('organisation_id', auth.organisationId)
    .order('effective_from', { ascending: false })

  const changes = (rawChanges ?? []) as CountChangeRow[]

  const contract = data.contract?.[0]
  const property = data.property?.[0]
  const unit = data.unit?.[0]

  const weekly = toBig(data.weekly_rate_pence)
  const gross = placementGrossPerWeekPence({
    weeklyRatePence: weekly,
    serviceUserCount: data.service_user_count,
  })
  const commission =
    data.commission_rate_bps_override ?? contract?.commission_rate_bps ?? 0
  const net = placementNetPerWeekPence({
    weeklyRatePence: weekly,
    serviceUserCount: data.service_user_count,
    commissionRateBpsOverride: data.commission_rate_bps_override,
    contractCommissionRateBps: contract?.commission_rate_bps ?? 0,
  })

  const canManage =
    auth.role === 'owner' || auth.role === 'admin' || auth.role === 'manager'

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.placement_ref}
        description={
          property
            ? `${property.address_line_1}, ${property.postcode}${unit ? ` · ${unit.label}` : ''}`
            : undefined
        }
        actions={
          <Link
            href="/aasc/placements"
            className="self-center text-sm font-medium text-muted-foreground hover:underline"
          >
            ← All placements
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={data.status} />
        {contract && (
          <Link
            href={`/aasc/contracts/${contract.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {contract.contractor} · {contract.reference ?? contract.id.slice(0, 8)} →
          </Link>
        )}
      </div>

      <PlacementActionsPanel
        placementId={data.id}
        serviceUserCount={data.service_user_count}
        canManage={canManage}
        active={data.status === 'active'}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile label="Service users" display={data.service_user_count} />
        <KpiTile
          label="Gross / week"
          display={<MoneyDisplay pence={gross} />}
          sub={`£${(Number(weekly) / 100).toFixed(2)} × ${data.service_user_count} SU`}
        />
        <KpiTile
          label="Net / week"
          display={<MoneyDisplay pence={net} />}
          sub={`After ${bpsToPercent(commission)} commission`}
        />
        <KpiTile
          label="Annualised net"
          display={<MoneyDisplay pence={net * 52n} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Start" display={<DateDisplay date={data.start_date} />} />
        <Field
          label="Expected end"
          display={
            data.end_date_expected ? <DateDisplay date={data.end_date_expected} /> : '—'
          }
        />
        <Field
          label="Actual end"
          display={data.end_date ? <DateDisplay date={data.end_date} /> : '—'}
        />
      </div>

      <section>
        <h2 className="mb-2 text-base font-medium">Service-user count history</h2>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No count changes recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Effective from</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <DateDisplay date={c.effective_from} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.new_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.reason ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

function Field({ label, display }: { label: string; display: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{display}</p>
    </div>
  )
}
