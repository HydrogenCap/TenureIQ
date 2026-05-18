// app/(app)/transactions/import/page.tsx — entry page (upload).

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { BankImportWizard } from './_components/bank-import-wizard'

type BankRow = { id: string; label: string; bank_name: string | null }
type ImportRow = {
  id: string
  filename: string
  format: string
  row_count: number
  status: string
  created_at: string
}

export default async function BankImportPage() {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) redirect('/transactions')

  const sb = await supabaseServer()
  const [banksRes, recentRes] = await Promise.all([
    sb
      .from('bank_accounts')
      .select('id, label, bank_name')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('label'),
    sb
      .from('transaction_imports')
      .select('id, filename, format, row_count, status, created_at')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const bankAccounts = ((banksRes.data ?? []) as BankRow[]).map((b) => ({
    id: b.id,
    name: b.bank_name ? `${b.label} · ${b.bank_name}` : b.label,
  }))
  const recent = (recentRes.data ?? []) as ImportRow[]

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Import bank CSV"
        description="Upload a statement CSV. Format is auto-detected for Monzo, Starling, and HSBC; other banks fall through to the generic mapper."
      />

      <BankImportWizard bankAccounts={bankAccounts} />

      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-medium">Recent imports</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filename</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.status === 'previewing' ? (
                      <Link href={`/transactions/import/${r.id}`} className="hover:underline">
                        {r.filename}
                      </Link>
                    ) : (
                      r.filename
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.format} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.row_count}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    <DateDisplay date={r.created_at} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  )
}
