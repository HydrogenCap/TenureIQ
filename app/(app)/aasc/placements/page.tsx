import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { MoneyDisplay } from '@/components/money-display'

type DbRow = {
  id: string
  placement_ref: string
  status: string
  service_user_count: number
  weekly_rate_pence: string | number
  start_date: string
  end_date: string | null
  contract: Array<{ contractor: string; reference: string | null }>
  property: Array<{ address_line_1: string; postcode: string }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function PlacementsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; contract?: string; property?: string }>
}) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const { status, contract, property } = await searchParams

  const sb = await supabaseServer()
  let q = sb
    .from('aasc_placements')
    .select(
      'id, placement_ref, status, service_user_count, weekly_rate_pence, start_date, end_date, contract:aasc_contracts(contractor, reference), property:properties(address_line_1, postcode)',
    )
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })

  if (status) q = q.eq('status', status)
  if (contract) q = q.eq('contract_id', contract)
  if (property) q = q.eq('property_id', property)

  const { data: raw } = await q
  const rows = (raw ?? []) as DbRow[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="AASC placements"
        description="Per-property placements. Service-user counts only — no identity data."
        actions={
          <Link href="/aasc/placements/new" className={buttonVariants()}>
            + New placement
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No placements yet"
          description="Create an AASC contract first, then add placements under it."
          action={
            <Link
              href="/aasc/contracts"
              className={buttonVariants({ variant: 'outline' })}
            >
              Go to contracts
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Contractor</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">SUs</TableHead>
              <TableHead className="text-right">£/week</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs font-medium">
                  <Link href={`/aasc/placements/${p.id}`} className="hover:underline">
                    {p.placement_ref}
                  </Link>
                </TableCell>
                <TableCell className="text-sm capitalize">
                  {p.contract?.[0]?.contractor ?? '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {p.property?.[0]
                    ? `${p.property[0].address_line_1}, ${p.property[0].postcode}`
                    : '—'}
                </TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.service_user_count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <MoneyDisplay pence={toBig(p.weekly_rate_pence)} />
                </TableCell>
                <TableCell className="text-sm">
                  <DateDisplay date={p.start_date} />
                </TableCell>
                <TableCell className="text-sm">
                  {p.end_date ? <DateDisplay date={p.end_date} /> : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
