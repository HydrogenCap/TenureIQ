// Property detail Documents tab — list of documents linked to this
// property plus an Upload link. Server component.

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'

type DbRow = {
  id: string
  filename: string
  mime_type: string
  size_bytes: string | number
  kind: string | null
  status: string
  uploaded_at: string
  confidence_bps: number | null
}

export async function DocumentsTab({ propertyId }: { propertyId: string }) {
  const auth = await requireOrgMember()
  if (!auth.ok) return null

  const sb = await supabaseServer()
  const { data: raw } = await sb
    .from('documents')
    .select('id, filename, mime_type, size_bytes, kind, status, uploaded_at, confidence_bps')
    .eq('property_id', propertyId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })

  const docs = (raw ?? []) as DbRow[]

  if (docs.length === 0) {
    return (
      <EmptyState
        title="No documents yet"
        description="Upload certificates, leases, invoices, statements. PDFs are OCR'd to auto-extract compliance dates."
        action={
          <Link
            href={`/documents/upload?propertyId=${propertyId}`}
            className={buttonVariants()}
          >
            + Upload document
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {docs.length} {docs.length === 1 ? 'document' : 'documents'}
        </p>
        <Link
          href={`/documents/upload?propertyId=${propertyId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          + Upload document
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filename</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead className="text-right">Confidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">
                <Link href={`/documents/${d.id}`} className="hover:underline">
                  {d.filename}
                </Link>
                <p className="text-xs text-muted-foreground">{d.mime_type}</p>
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
    </div>
  )
}
