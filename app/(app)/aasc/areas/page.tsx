import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'

type DbRow = {
  id: string
  contractor: string
  local_authority: string
  status: string | null
  demand_pending: number | null
  pipeline: number | null
  note: string | null
  effective_date: string
}

export default async function AreasPage({
  searchParams,
}: {
  searchParams: Promise<{ contractor?: string }>
}) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const { contractor } = await searchParams

  const sb = await supabaseServer()
  let q = sb
    .from('aasc_areas')
    .select('id, contractor, local_authority, status, demand_pending, pipeline, note, effective_date')
    .order('contractor')
    .order('local_authority')
  if (contractor) q = q.eq('contractor', contractor)

  const { data: raw } = await q
  const rows = (raw ?? []) as DbRow[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="AASC areas"
        description="Reference data: which local authorities each contractor is currently sourcing into. Updated by admin tooling."
      />

      <nav className="flex flex-wrap gap-2 text-sm">
        <a
          href="/aasc/areas"
          className={
            !contractor
              ? 'rounded-md border bg-primary px-3 py-1 text-primary-foreground'
              : 'rounded-md border px-3 py-1 hover:bg-muted'
          }
        >
          All
        </a>
        <a
          href="/aasc/areas?contractor=clearsprings"
          className={
            contractor === 'clearsprings'
              ? 'rounded-md border bg-primary px-3 py-1 text-primary-foreground'
              : 'rounded-md border px-3 py-1 hover:bg-muted'
          }
        >
          Clearsprings
        </a>
        <a
          href="/aasc/areas?contractor=serco"
          className={
            contractor === 'serco'
              ? 'rounded-md border bg-primary px-3 py-1 text-primary-foreground'
              : 'rounded-md border px-3 py-1 hover:bg-muted'
          }
        >
          Serco
        </a>
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No areas seeded yet. The reference data tables are populated by admin
          tooling (see <code>skills/tenureiq-domain/data/</code> for the source JSON).
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contractor</TableHead>
              <TableHead>Local authority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Demand pending</TableHead>
              <TableHead className="text-right">Pipeline</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>As of</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="capitalize">{a.contractor}</TableCell>
                <TableCell className="font-medium">{a.local_authority}</TableCell>
                <TableCell>
                  {a.status ? (
                    <StatusBadge status={a.status} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.demand_pending ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.pipeline ?? '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {a.note ?? '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {a.effective_date}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
