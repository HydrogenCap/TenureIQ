// app/(app)/transactions/import/[id]/page.tsx — preview + commit.

import { notFound, redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { PreviewTable } from './_components/preview-table'

type ImportRow = {
  id: string
  filename: string
  format: string
  status: string
  row_count: number
  bank_account_id: string
}

type StagedRow = {
  id: string
  row_index: number
  posted_at: string
  description: string
  amount_pence: string | number
  reference: string | null
  external_id: string | null
  category_code: string
  property_id: string | null
  status: string
  duplicate_of_transaction_id: string | null
}

type PropertyRow = { id: string; address_line_1: string; postcode: string }

export default async function ImportPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) redirect('/transactions/import')

  const sb = await supabaseServer()
  const [importRes, rowsRes, propsRes] = await Promise.all([
    sb
      .from('transaction_imports')
      .select('id, filename, format, status, row_count, bank_account_id')
      .eq('id', id)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .maybeSingle<ImportRow>(),
    sb
      .from('transaction_import_rows')
      .select(
        'id, row_index, posted_at, description, amount_pence, reference, external_id, category_code, property_id, status, duplicate_of_transaction_id',
      )
      .eq('import_id', id)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('row_index'),
    sb
      .from('properties')
      .select('id, address_line_1, postcode')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('address_line_1'),
  ])

  const imp = importRes.data
  if (!imp) notFound()
  const rows = (rowsRes.data ?? []) as StagedRow[]
  const properties = ((propsRes.data ?? []) as PropertyRow[]).map((p) => ({
    id: p.id,
    label: `${p.address_line_1}, ${p.postcode}`,
  }))

  const pending = rows.filter((r) => r.status === 'pending').length
  const duplicates = rows.filter((r) => r.status === 'duplicate').length
  const skipped = rows.filter((r) => r.status === 'skipped').length
  const committed = rows.filter((r) => r.status === 'committed').length

  return (
    <div className="space-y-6">
      <PageHeader
        title={imp.filename}
        description={`${imp.format} format · ${imp.row_count} rows staged`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={imp.status} />
        <span className="text-xs text-muted-foreground">
          {pending} pending · {duplicates} duplicates · {skipped} skipped · {committed} committed
        </span>
      </div>

      <PreviewTable
        importId={imp.id}
        status={imp.status}
        rows={rows.map((r) => ({
          id: r.id,
          postedAt: r.posted_at,
          description: r.description,
          amountPence: BigInt(typeof r.amount_pence === 'string' ? r.amount_pence : Math.round(r.amount_pence)),
          reference: r.reference,
          externalId: r.external_id,
          categoryCode: r.category_code,
          propertyId: r.property_id,
          status: r.status,
          duplicateOfTransactionId: r.duplicate_of_transaction_id,
        }))}
        properties={properties}
      />
    </div>
  )
}
