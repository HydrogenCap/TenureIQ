// lib/jobs/ocr-document.ts
// OCR a single document. Service-role allowed here (lib/jobs/ is in
// the convention's allowed paths).
//
// Tesseract.js itself isn't wired up in this commit — the wrapper at
// lib/ocr/tesseract.ts is queued as a chunky follow-up that includes
// pdf-poppler rasterisation, EXIF orientation, and per-page concat.
// This file is the "rest of the pipeline" — download from storage,
// run extraction on whatever OCR text we have (empty for now), persist
// status + extracted_json — so the upload → list → confirm UX works
// end-to-end as soon as Tesseract lands.

import 'server-only'
import { supabaseService } from '@/lib/db/admin'
import { extractByKind } from '@/lib/ocr/extract'

export type OcrJobResult =
  | { ok: true; documentId: string; confidenceBps: number }
  | { ok: false; documentId: string; error: string }

// Placeholder until lib/ocr/tesseract.ts lands. Today returns empty
// text + 0 OCR confidence; the per-kind extractor runs against that
// (returns nulls), so the document lands in `ocr_complete` state with
// zero confidence, and the user fills the form by hand (same UX as
// the manual /compliance/new flow).
async function ocrTextFromBuffer(_buffer: ArrayBuffer): Promise<{
  text: string
  confidenceBps: number
}> {
  return { text: '', confidenceBps: 0 }
}

export async function ocrDocument(documentId: string): Promise<OcrJobResult> {
  const sb = supabaseService()

  // 1. Load the document row.
  const { data: doc, error: docErr } = await sb
    .from('documents')
    .select('id, organisation_id, storage_path, kind, status, deleted_at')
    .eq('id', documentId)
    .maybeSingle<{
      id: string
      organisation_id: string
      storage_path: string
      kind: string | null
      status: string
      deleted_at: string | null
    }>()

  if (docErr) return { ok: false, documentId, error: `load: ${docErr.message}` }
  if (!doc || doc.deleted_at) {
    return { ok: false, documentId, error: 'document not found' }
  }
  // Idempotent: if already past ocr_running, skip.
  if (doc.status !== 'uploaded' && doc.status !== 'ocr_running') {
    return { ok: true, documentId, confidenceBps: 0 }
  }

  // 2. Mark running.
  await sb
    .from('documents')
    .update({ status: 'ocr_running', updated_at: new Date().toISOString() })
    .eq('id', documentId)

  try {
    // 3. Download the blob.
    const dl = await sb.storage.from('documents').download(doc.storage_path)
    if (dl.error || !dl.data) {
      throw new Error(dl.error?.message ?? 'storage download returned no data')
    }
    const buffer = await dl.data.arrayBuffer()

    // 4. Run OCR (currently stubbed — see ocrTextFromBuffer above).
    const ocr = await ocrTextFromBuffer(buffer)

    // 5. Run per-kind extraction if the document has a compliance kind.
    let extracted = null as ReturnType<typeof extractByKind>['extracted'] | null
    let fieldConfidenceBps = 0
    if (doc.kind) {
      const result = extractByKind(doc.kind, ocr.text)
      extracted = result.extracted
      fieldConfidenceBps = result.fieldConfidenceBps
    }

    // Overall confidence = weighted blend (60% OCR, 40% extraction).
    const overallBps = Math.round(ocr.confidenceBps * 0.6 + fieldConfidenceBps * 0.4)

    await sb
      .from('documents')
      .update({
        status: 'ocr_complete',
        ocr_text: ocr.text,
        ocr_confidence_bps: ocr.confidenceBps,
        confidence_bps: overallBps,
        extracted_json: extracted,
        ocr_failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    // Meter for the per-month OCR quota in lib/billing/can.ts. One row
    // per successful run; canRunOcrThisMonth counts these.
    await sb.from('usage_log').insert({
      organisation_id: doc.organisation_id,
      metric: 'ocr_runs',
      at: new Date().toISOString(),
      count: 1,
    })

    return { ok: true, documentId, confidenceBps: overallBps }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown'
    await sb
      .from('documents')
      .update({
        status: 'ocr_failed',
        ocr_failure_reason: reason.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
    return { ok: false, documentId, error: reason }
  }
}
