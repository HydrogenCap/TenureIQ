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
import { isQuotaExceededError, quotaErrorMessage } from '@/lib/billing/quota-error'
import { extractByKind } from '@/lib/ocr/extract'
import { runTesseractOnBuffer } from '@/lib/ocr/tesseract'
import { extractEmbeddedPdfText } from '@/lib/ocr/pdf-text'

export type OcrJobResult =
  | { ok: true; documentId: string; confidenceBps: number }
  | { ok: false; documentId: string; error: string }

// Two-stage extraction:
//   1. PDFs go through pdfjs first — most UK compliance certs are
//      issuer-generated text PDFs and the embedded text layer is
//      faithful with confidence 100%. If the PDF has fewer than ~40
//      meaningful chars (i.e. a scan-of-paper) we fall through.
//   2. Otherwise (images, or text-less PDFs) hand off to tesseract.js.
//      HEIC/HEIF are rejected for now — they need sharp transcoding
//      first, which we haven't shipped.
async function ocrTextFromBuffer(
  buffer: ArrayBuffer,
  mime: string,
): Promise<{ text: string; confidenceBps: number }> {
  if (mime === 'application/pdf') {
    const embedded = await extractEmbeddedPdfText(buffer)
    if (embedded) {
      return { text: embedded.text, confidenceBps: embedded.confidenceBps }
    }
    // Scan-of-paper PDF without a text layer. Rasterise+OCR per page
    // requires a Node canvas backend (sharp + pdfjs render) which is a
    // larger surgery; for v1 we return an empty text with 0 confidence
    // so the per-kind extractor returns nulls and the user fills the
    // form by hand.
    return { text: '', confidenceBps: 0 }
  }
  if (mime.startsWith('image/')) {
    const out = await runTesseractOnBuffer(buffer, mime)
    return out
  }
  // Unrecognised mime (shouldn't reach here — ALLOWED_MIME is enforced
  // in the upload schema).
  return { text: '', confidenceBps: 0 }
}

export async function ocrDocument(documentId: string): Promise<OcrJobResult> {
  const sb = supabaseService()

  // 1. Load the document row.
  const { data: doc, error: docErr } = await sb
    .from('documents')
    .select('id, organisation_id, storage_path, kind, mime_type, status, deleted_at')
    .eq('id', documentId)
    .maybeSingle<{
      id: string
      organisation_id: string
      storage_path: string
      kind: string | null
      mime_type: string
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

  // 2. Pre-meter the run. The quota trigger on usage_log (migration
  //    20260515000019) rejects if this org has already hit its monthly
  //    OCR cap, so we abort BEFORE doing the expensive download +
  //    tesseract pass rather than after.
  const { error: meterErr } = await sb.from('usage_log').insert({
    organisation_id: doc.organisation_id,
    metric: 'ocr_runs',
    at: new Date().toISOString(),
    count: 1,
  })
  if (meterErr) {
    if (isQuotaExceededError(meterErr)) {
      const reason = quotaErrorMessage('ocr-runs')
      await sb
        .from('documents')
        .update({
          status: 'ocr_failed',
          ocr_failure_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
      return { ok: false, documentId, error: reason }
    }
    return { ok: false, documentId, error: `meter: ${meterErr.message}` }
  }

  // 3. Mark running.
  await sb
    .from('documents')
    .update({ status: 'ocr_running', updated_at: new Date().toISOString() })
    .eq('id', documentId)

  try {
    // 4. Download the blob.
    const dl = await sb.storage.from('documents').download(doc.storage_path)
    if (dl.error || !dl.data) {
      throw new Error(dl.error?.message ?? 'storage download returned no data')
    }
    const buffer = await dl.data.arrayBuffer()

    // 4. Run OCR (PDF text layer → fall back to tesseract for images).
    const ocr = await ocrTextFromBuffer(buffer, doc.mime_type)

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

    // Meter row was inserted up-front at step 2 so the quota trigger
    // can gate the heavy work, not just record it post-hoc.

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
