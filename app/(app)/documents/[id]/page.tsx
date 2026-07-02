import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { COMPLIANCE_DOCUMENT_KINDS, type DocumentKind } from '@/lib/schemas/document'
import { ConfirmExtractionPanel } from './_components/confirm-extraction-panel'

type DbRow = {
  id: string
  filename: string
  mime_type: string
  size_bytes: string | number
  property_id: string | null
  kind: string | null
  status: string
  uploaded_at: string
  ocr_text: string | null
  extracted_json: { issueDate?: string; expiryDate?: string; issuer?: string } | null
  ocr_confidence_bps: number | null
  confidence_bps: number | null
  ocr_failure_reason: string | null
  storage_path: string
  derived_compliance_item_id: string | null
  confirmed_at: string | null
  rejected_at: string | null
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data } = await sb
    .from('documents')
    .select(
      'id, filename, mime_type, size_bytes, property_id, kind, status, uploaded_at, ocr_text, extracted_json, ocr_confidence_bps, confidence_bps, ocr_failure_reason, storage_path, derived_compliance_item_id, confirmed_at, rejected_at',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  // Signed download URL (5 minutes). Generated on each render — small
  // performance cost, but the alternative (caching in session) leaks
  // permission durations.
  const { data: signed } = await sb.storage
    .from('documents')
    .createSignedUrl(data.storage_path, 300)

  const canConfirm =
    data.status === 'ocr_complete' &&
    data.kind !== null &&
    COMPLIANCE_DOCUMENT_KINDS.has(data.kind as DocumentKind) &&
    data.property_id !== null

  const sizeMb = Number(data.size_bytes) / 1024 / 1024

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.filename}
        description={
          <>
            {data.mime_type} · {sizeMb.toFixed(2)} MB · uploaded{' '}
            <DateDisplay date={data.uploaded_at} formatStr="d MMM yyyy, HH:mm" />
          </>
        }
        actions={
          <Link
            href="/documents"
            className="self-center text-sm font-medium text-muted-foreground hover:underline"
          >
            ← Documents
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {data.kind && <StatusBadge status={data.kind} />}
        <StatusBadge status={data.status} />
        {data.confidence_bps !== null && (
          <span className="text-xs text-muted-foreground">
            Confidence: {(data.confidence_bps / 100).toFixed(0)}%
          </span>
        )}
      </div>

      {data.status === 'ocr_failed' && data.ocr_failure_reason && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          OCR failed: {data.ocr_failure_reason}
        </div>
      )}

      {data.derived_compliance_item_id && (
        <div className="rounded-md border bg-card p-3 text-sm">
          ✓ Confirmed{' '}
          {data.confirmed_at && (
            <>
              on <DateDisplay date={data.confirmed_at} />
            </>
          )}{' '}
          ·{' '}
          <Link
            href={`/compliance/${data.derived_compliance_item_id}`}
            className="font-medium text-primary hover:underline"
          >
            View compliance item →
          </Link>
        </div>
      )}

      {canConfirm && (
        <ConfirmExtractionPanel
          documentId={data.id}
          kind={data.kind as DocumentKind}
          extracted={data.extracted_json}
        />
      )}

      <section>
        <h3 className="mb-2 text-base font-medium">File</h3>
        {signed?.signedUrl ? (
          data.mime_type.startsWith('image/') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signed.signedUrl}
              alt={data.filename}
              className="max-h-[600px] rounded-md border"
            />
          ) : (
            <iframe
              src={signed.signedUrl}
              className="h-[600px] w-full rounded-md border"
              title={data.filename}
            />
          )
        ) : (
          <p className="text-sm text-destructive">Could not generate signed URL.</p>
        )}
      </section>

      {data.ocr_text && (
        <details className="rounded-md border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Raw OCR text ({data.ocr_text.length} chars)
          </summary>
          <pre className="mt-2 max-h-[300px] overflow-auto whitespace-pre-wrap font-mono text-xs">
            {data.ocr_text}
          </pre>
        </details>
      )}
    </div>
  )
}
