import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { MoneyDisplay } from '@/components/money-display'
import { bpsToPercent } from '@/lib/money'
import { buttonVariants } from '@/components/ui/button'

type DbRow = {
  id: string
  contractor: string
  kind: string
  reference: string | null
  status: string
  start_date: string
  end_date: string | null
  break_clause_date: string | null
  contracted_rate_pence_per_week: string | number | null
  commission_rate_bps: number
  payment_terms_days: number
  notes: string | null
}

type PlacementRow = {
  id: string
  placement_ref: string
  status: string
  service_user_count: number
  weekly_rate_pence: string | number
  start_date: string
  end_date: string | null
  property: Array<{ address_line_1: string; postcode: string }>
}

function toBig(v: string | number | null): bigint | null {
  if (v === null) return null
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data } = await sb
    .from('aasc_contracts')
    .select(
      'id, contractor, kind, reference, status, start_date, end_date, break_clause_date, contracted_rate_pence_per_week, commission_rate_bps, payment_terms_days, notes',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  const { data: rawPlacements } = await sb
    .from('aasc_placements')
    .select(
      'id, placement_ref, status, service_user_count, weekly_rate_pence, start_date, end_date, property:properties(address_line_1, postcode)',
    )
    .eq('contract_id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })

  const placements = (rawPlacements ?? []) as PlacementRow[]
  const canManage =
    auth.role === 'owner' || auth.role === 'admin' || auth.role === 'manager'

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${data.contractor} — ${data.reference ?? data.id.slice(0, 8)}`}
        description={`${data.kind.replace(/_/g, ' ')} · ${data.payment_terms_days}-day payment terms · ${bpsToPercent(data.commission_rate_bps)} commission`}
        actions={
          canManage && (
            <Link
              href={`/aasc/contracts/${id}/edit`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Edit
            </Link>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={data.status} />
        <StatusBadge status={data.contractor} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Start" display={<DateDisplay date={data.start_date} />} />
        <Field
          label="End"
          display={data.end_date ? <DateDisplay date={data.end_date} /> : '—'}
        />
        <Field
          label="Break clause"
          display={
            data.break_clause_date ? <DateDisplay date={data.break_clause_date} /> : '—'
          }
        />
        <Field
          label="Contracted rate"
          display={<MoneyDisplay pence={toBig(data.contracted_rate_pence_per_week)} />}
        />
      </div>

      {data.notes && (
        <section>
          <h3 className="mb-2 text-base font-medium">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.notes}</p>
        </section>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">Placements ({placements.length})</h2>
          {canManage && (
            <Link
              href={`/aasc/placements/new?contractId=${id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              + New placement
            </Link>
          )}
        </div>

        {placements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No placements under this contract yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">SUs</TableHead>
                <TableHead className="text-right">£/week</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {placements.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/aasc/placements/${p.id}`} className="hover:underline">
                      {p.placement_ref}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.property?.[0]?.address_line_1 ?? '—'}
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
