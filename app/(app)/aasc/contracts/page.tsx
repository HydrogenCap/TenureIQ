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
  contractor: string
  kind: string
  reference: string | null
  status: string
  start_date: string
  end_date: string | null
  break_clause_date: string | null
  contracted_rate_pence_per_week: string | number | null
}

function toBig(v: string | number | null): bigint | null {
  if (v === null) return null
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function ContractsListPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data: raw } = await sb
    .from('aasc_contracts')
    .select(
      'id, contractor, kind, reference, status, start_date, end_date, break_clause_date, contracted_rate_pence_per_week',
    )
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })

  const rows = (raw ?? []) as DbRow[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="AASC contracts"
        description="Per-contractor agreements with Clearsprings or Serco."
        actions={
          <Link href="/aasc/contracts/new" className={buttonVariants()}>
            + New contract
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No AASC contracts"
          description="Record your Clearsprings or Serco agreement to track break clauses and end dates."
          action={
            <Link href="/aasc/contracts/new" className={buttonVariants()}>
              + New contract
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contractor</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Break clause</TableHead>
              <TableHead className="text-right">Rate / week</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium capitalize">
                  <Link href={`/aasc/contracts/${c.id}`} className="hover:underline">
                    {c.contractor}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{c.reference ?? '—'}</TableCell>
                <TableCell className="text-sm">{c.kind.replace(/_/g, ' ')}</TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell className="text-sm">
                  <DateDisplay date={c.start_date} />
                </TableCell>
                <TableCell className="text-sm">
                  {c.end_date ? <DateDisplay date={c.end_date} /> : '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {c.break_clause_date ? <DateDisplay date={c.break_clause_date} /> : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <MoneyDisplay pence={toBig(c.contracted_rate_pence_per_week)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
