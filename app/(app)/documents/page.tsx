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

// Review-inbox card row. extracted_json shape matches what the OCR
// extractors write (see lib/jobs/ocr-document.ts) and what the confirm
// panel reads on the detail page.
type ReviewDbRow = {
  id: string
  filename: string
  kind: string | null
  uploaded_at: string
  confidence_bps: number | null
  extracted_json: { issueDate?: string; expiryDate?: string; issuer?: string } | null
  property: Array<{ address_line_1: string; postcode: string }>
}

// Keep the inbox scannable — past this, "and N more" links to the full
// filtered list instead of pushing the library table off-screen.
const REVIEW_INBOX_CAP = 10

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

  // Review inbox: OCR finished but nobody has confirmed the extraction.
  // In the pipeline (uploaded -> ocr_running -> ocr_complete ->
  // confirmed | rejected, with ocr_failed as the error branch),
  // `ocr_complete` is exactly that state — confirming flips the status,
  // so no extra confirmed_by_user_id predicate is needed. count:
  // 'exact' rides along so the "and N more" note works without a
  // second query.
  const reviewQuery = sb
    .from('documents')
    .select(
      'id, filename, kind, uploaded_at, confidence_bps, extracted_json, property:properties(address_line_1, postcode)',
      { count: 'exact' },
    )
    .eq('organisation_id', auth.organisationId)
    .eq('status', 'ocr_complete')
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })
    .limit(REVIEW_INBOX_CAP)

  const [{ data: raw }, { data: reviewRaw, count: reviewCount }] = await Promise.all([
    query,
    reviewQuery,
  ])
  const rows = (raw ?? []) as DbRow[]
  const reviewRows = (reviewRaw ?? []) as ReviewDbRow[]
  const reviewOverflow = Math.max(0, (reviewCount ?? reviewRows.length) - reviewRows.length)

  // When the "Needs review" filter is active the table below already IS
  // this list — showing the inbox too would render everything twice.
  const showReviewInbox = reviewRows.length > 0 && status !== 'review'

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

      {showReviewInbox && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-medium">Needs review</h2>
            <p className="text-xs text-muted-foreground">
              OCR finished — confirm the extracted fields to create compliance items.
            </p>
          </div>
          <ul className="space-y-2">
            {reviewRows.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{d.filename}</p>
                    {d.kind && <StatusBadge status={d.kind} />}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {d.property?.[0]
                      ? `${d.property[0].address_line_1}, ${d.property[0].postcode}`
                      : 'No property linked'}
                    {' · uploaded '}
                    <DateDisplay date={d.uploaded_at} />
                    {d.confidence_bps !== null && (
                      <> · confidence {(d.confidence_bps / 100).toFixed(0)}%</>
                    )}
                  </p>
                  {d.extracted_json?.expiryDate && (
                    <p className="mt-0.5 text-xs">
                      Extracted expiry:{' '}
                      <span className="font-medium">
                        <DateDisplay date={d.extracted_json.expiryDate} />
                      </span>
                      {d.extracted_json.issuer && <> · issuer {d.extracted_json.issuer}</>}
                    </p>
                  )}
                </div>
                <Link
                  href={`/documents/${d.id}`}
                  className={buttonVariants({ size: 'sm' })}
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
          {reviewOverflow > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              <Link href="/documents?status=review" className="hover:underline">
                …and {reviewOverflow} more awaiting review →
              </Link>
            </p>
          )}
        </section>
      )}

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
