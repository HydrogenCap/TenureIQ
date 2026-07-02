// app/(app)/documents/page.tsx — global library.

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

type DbRow = {
  id: string
  filename: string
  mime_type: string
  kind: string | null
  status: string
  uploaded_at: string
  confidence_bps: number | null
  property: Array<{ address_line_1: string; postcode: string }>
}

export const metadata = { title: 'Documents' }

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>
}) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const { status, kind } = await searchParams

  const sb = await supabaseServer()
  let query = sb
    .from('documents')
    .select(
      'id, filename, mime_type, kind, status, uploaded_at, confidence_bps, property:properties(address_line_1, postcode)',
    )
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })
    .limit(200)

  if (status === 'review') {
    query = query.eq('status', 'ocr_complete')
  } else if (status) {
    query = query.eq('status', status)
  }
  if (kind) query = query.eq('kind', kind)

  const { data: raw } = await query
  const rows = (raw ?? []) as DbRow[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Certificates, leases, invoices. PDFs are OCR'd to auto-extract compliance dates."
        actions={
          <Link href="/documents/upload" className={buttonVariants()}>
            + Upload
          </Link>
        }
      />

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/documents"
          className={
            !status
              ? 'rounded-md border bg-primary px-3 py-1 text-primary-foreground'
              : 'rounded-md border px-3 py-1 hover:bg-muted'
          }
        >
          All
        </Link>
        <Link
          href="/documents?status=review"
          className={
            status === 'review'
              ? 'rounded-md border bg-primary px-3 py-1 text-primary-foreground'
              : 'rounded-md border px-3 py-1 hover:bg-muted'
          }
        >
          Needs review
        </Link>
        <Link
          href="/documents?status=confirmed"
          className={
            status === 'confirmed'
              ? 'rounded-md border bg-primary px-3 py-1 text-primary-foreground'
              : 'rounded-md border px-3 py-1 hover:bg-muted'
          }
        >
          Confirmed
        </Link>
        <Link
          href="/documents?status=ocr_failed"
          className={
            status === 'ocr_failed'
              ? 'rounded-md border bg-primary px-3 py-1 text-primary-foreground'
              : 'rounded-md border px-3 py-1 hover:bg-muted'
          }
        >
          Failed
        </Link>
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Upload a gas safety, EICR, EPC, or any PDF/photo. OCR runs in the background."
          action={
            <Link href="/documents/upload" className={buttonVariants()}>
              + Upload your first document
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">
                  <Link href={`/documents/${d.id}`} className="hover:underline">
                    {d.filename}
                  </Link>
                  <p className="text-xs text-muted-foreground">{d.mime_type}</p>
                </TableCell>
                <TableCell className="text-sm">
                  {d.property?.[0] ? (
                    `${d.property[0].address_line_1}, ${d.property[0].postcode}`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {d.kind ? (
                    <StatusBadge status={d.kind} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={d.status} />
                </TableCell>
                <TableCell className="text-sm">
                  <DateDisplay date={d.uploaded_at} />
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {d.confidence_bps !== null
                    ? `${(d.confidence_bps / 100).toFixed(0)}%`
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
