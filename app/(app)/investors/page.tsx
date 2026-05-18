// app/(app)/investors/page.tsx — global investors list.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'

type InvestorDbRow = {
  id: string
  name: string
  kind: string
  contact_email: string | null
}

type AccountDbRow = {
  investor_id: string
  status: string
  commitment_pence: string | number
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function InvestorsListPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const [investorsRes, accountsRes] = await Promise.all([
    sb
      .from('investors')
      .select('id, name, kind, contact_email')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('name'),
    sb
      .from('investor_capital_accounts')
      .select('investor_id, status, commitment_pence')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null),
  ])

  const investors = (investorsRes.data ?? []) as InvestorDbRow[]
  const accounts = (accountsRes.data ?? []) as AccountDbRow[]

  // Aggregate commitments per investor.
  const commitments = new Map<string, { open: number; closed: number; commitmentPence: bigint }>()
  for (const a of accounts) {
    const cur = commitments.get(a.investor_id) ?? {
      open: 0,
      closed: 0,
      commitmentPence: 0n,
    }
    if (a.status === 'open') cur.open++
    if (a.status === 'closed') cur.closed++
    cur.commitmentPence += toBig(a.commitment_pence)
    commitments.set(a.investor_id, cur)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investors"
        description="Capital partners — individuals, entities, or SPVs holding preferred / common equity or loan-style positions."
        actions={
          <Link href="/investors/new" className={buttonVariants()}>
            + New investor
          </Link>
        }
      />

      {investors.length === 0 ? (
        <EmptyState
          title="No investors yet"
          description="Add an investor and open a capital account against one of your entities."
          action={
            <Link href="/investors/new" className={buttonVariants()}>
              + New investor
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Accounts</TableHead>
              <TableHead className="text-right">Committed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {investors.map((inv) => {
              const c = commitments.get(inv.id)
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    <Link href={`/investors/${inv.id}`} className="hover:underline">
                      {inv.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={inv.kind} />
                  </TableCell>
                  <TableCell className="text-sm">{inv.contact_email ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? `${c.open} open${c.closed ? ` · ${c.closed} closed` : ''}` : '0'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={c?.commitmentPence ?? null} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
