---
name: tenureiq-ocr-pipeline
description: OCR pipeline for compliance certificate documents in TenureIQ. Use whenever building or modifying document upload, OCR text extraction, certificate parsing, or the confirm-extracted-fields UI. Covers the full flow — Supabase Storage upload → background job → Tesseract OCR (or cloud fallback) → regex extraction per certificate kind → confidence scoring → user-confirms-or-corrects UI → auto-create compliance_item. M7 scope.
---

# OCR Pipeline for Compliance Documents

When a landlord uploads a gas safety certificate, the system should extract the next service date and create a `compliance_item` automatically — but only after the user confirms. Wrong dates have legal consequences, so confidence and confirmation matter.

The regex patterns per cert kind are already in `tenureiq-domain/references/compliance.md` — don't duplicate them. This skill is about the **pipeline mechanics**: how OCR runs, where, with what confidence, and how the user confirms.

## The flow

```
1. Upload  → Supabase Storage (private bucket "documents")
            ↓ insert row in `documents` table with status='pending_ocr'
2. Trigger → Supabase Storage webhook OR Postgres NOTIFY OR enqueue to external queue
            ↓
3. OCR     → Background job: download blob, run Tesseract, persist raw text + confidence
            ↓ documents.status = 'ocr_complete'
4. Extract → Regex against text using `lib/domain/compliance.ts` patterns
            ↓ documents.extracted_json = { issue_date, expiry_date, certifier, ... }
            ↓ documents.confidence = aggregate score
5. Confirm → If confidence high AND user is admin, auto-create compliance_item silently
            → Otherwise: surface in "Documents pending review" with a confirm UI
6. Commit  → On confirm: create compliance_item, link document, mark documents.status='confirmed'
```

## File structure

```
lib/ocr/
  index.ts                       # high-level run(documentId) entrypoint
  tesseract.ts                   # local OCR (Tesseract.js)
  cloud.ts                       # cloud OCR adapter (optional fallback)
  confidence.ts                  # scoring logic
  extract/
    gas-safety.ts                # extracts from CP12 gas safety cert
    eicr.ts                      # extracts from electrical installation report
    epc.ts                       # extracts from EPC certificate
    pat.ts
    hmo-licence.ts
    fire-risk-assessment.ts

app/api/jobs/ocr/route.ts        # webhook target, dispatches OCR
app/(app)/documents/_components/
  pending-review-list.tsx        # the "needs your eyes" inbox
  extracted-fields-confirm.tsx   # the per-doc confirm UI
app/(app)/documents/actions.ts   # confirmExtraction, rejectExtraction
```

## OCR options — pick one

### Option A: Tesseract.js (in-process, free)

Runs in a Node worker. No external service. Quality is good for clean PDFs/scans, poor for photos taken at an angle.

```ts
// lib/ocr/tesseract.ts
import 'server-only'
import { createWorker } from 'tesseract.js'

export async function ocrTesseract(buffer: Buffer): Promise<{ text: string; confidence: number }> {
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(buffer)
    return { text: data.text, confidence: data.confidence / 100 }
  } finally {
    await worker.terminate()
  }
}
```

For PDFs, pre-rasterise pages with `pdf-poppler` or `pdf2pic` and OCR each page; concatenate text.

### Option B: AWS Textract / Google Document AI (cloud, paid)

Higher accuracy on photos, structured table extraction, but adds latency, cost, and a network dependency.

```ts
// lib/ocr/cloud.ts
import 'server-only'

export async function ocrCloud(buffer: Buffer): Promise<{ text: string; confidence: number; blocks?: unknown[] }> {
  // Implement with whichever provider — Textract recommended for UK/EU/eng-language docs
  // Return same shape so callers don't care.
  throw new Error('Cloud OCR not configured. Set OCR_PROVIDER env to enable.')
}
```

### Hybrid (recommended for production)

Start with Tesseract. If `confidence < 0.6` OR critical fields are missing, retry with cloud OCR. Cost stays low (~95% of docs are clear PDFs) while the long tail of phone-camera certs still works.

```ts
// lib/ocr/index.ts
import 'server-only'
import { ocrTesseract } from './tesseract'
import { ocrCloud } from './cloud'

export async function ocr(buffer: Buffer): Promise<{ text: string; confidence: number; provider: string }> {
  const first = await ocrTesseract(buffer)
  if (first.confidence >= 0.6 && first.text.length > 100) {
    return { ...first, provider: 'tesseract' }
  }
  if (process.env.OCR_PROVIDER === 'cloud') {
    const second = await ocrCloud(buffer)
    return { ...second, provider: 'cloud' }
  }
  return { ...first, provider: 'tesseract' }
}
```

## The job runner

OCR is too slow to run inline. Options:

- **Supabase Edge Function** — good for short tasks, but Tesseract.js may not fit cleanly. Cloud OCR works well here.
- **Vercel/Next.js route handler with extended timeout** — fine for development.
- **External queue (Trigger.dev, Inngest, Cloud Run job)** — recommended for production-scale.
- **`pg_cron` polling** — viable for low-volume single-tenant use.

For TenureIQ v1 (small number of orgs, low daily upload count), a Next.js route handler triggered by a Supabase Storage webhook is simplest:

```ts
// app/api/jobs/ocr/route.ts
import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db/admin'  // service role — restricted path
import { ocr } from '@/lib/ocr'
import { extractByKind } from '@/lib/ocr/extract'
import { computeConfidence } from '@/lib/ocr/confidence'

export const maxDuration = 300  // 5 min — Tesseract on a large PDF can be slow

export async function POST(req: Request) {
  // Verify webhook signature
  const signature = req.headers.get('x-supabase-signature')
  if (!verifySupabaseSignature(signature, await req.text())) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  const { record } = await req.json() as { record: { id: string; bucket_id: string; name: string } }
  if (record.bucket_id !== 'documents') return NextResponse.json({ skipped: true })

  const sb = supabaseService()

  // Find the documents row
  const { data: doc } = await sb
    .from('documents')
    .select('id, kind, storage_path, organisation_id')
    .eq('storage_path', record.name)
    .single()
  if (!doc) return NextResponse.json({ skipped: 'doc-not-found' })

  await sb.from('documents').update({ status: 'ocr_running' }).eq('id', doc.id)

  try {
    const { data: blob } = await sb.storage.from('documents').download(doc.storage_path)
    if (!blob) throw new Error('blob-missing')
    const buffer = Buffer.from(await blob.arrayBuffer())

    const { text, confidence: ocrConfidence, provider } = await ocr(buffer)
    const extracted = extractByKind(doc.kind, text)
    const overallConfidence = computeConfidence(ocrConfidence, extracted)

    await sb.from('documents').update({
      status: 'ocr_complete',
      ocr_text: text,
      ocr_provider: provider,
      ocr_confidence_bps: Math.round(ocrConfidence * 10000),
      extracted_json: extracted,
      confidence_bps: Math.round(overallConfidence * 10000),
    }).eq('id', doc.id)

    return NextResponse.json({ ok: true, confidence: overallConfidence })
  } catch (err) {
    await sb.from('documents').update({
      status: 'ocr_failed',
      ocr_error: String(err),
    }).eq('id', doc.id)
    return NextResponse.json({ ok: false, error: String(err) })
  }
}

function verifySupabaseSignature(sig: string | null, body: string): boolean {
  // Use crypto.timingSafeEqual against process.env.SUPABASE_WEBHOOK_SECRET
  return Boolean(sig)  // implement properly
}
```

## Extraction — per cert kind

```ts
// lib/ocr/extract/index.ts
import { extractGasSafety } from './gas-safety'
import { extractEicr } from './eicr'
import { extractEpc } from './epc'
import { extractPat } from './pat'
import { extractHmoLicence } from './hmo-licence'
import { extractFra } from './fire-risk-assessment'

export type Extracted = {
  issueDate?: string         // YYYY-MM-DD
  expiryDate?: string
  certifier?: string
  certNumber?: string
  fieldConfidence: Record<string, number>  // 0..1 per field
  raw: Record<string, string>  // raw matched strings — keep for audit
}

export function extractByKind(kind: string, text: string): Extracted {
  switch (kind) {
    case 'gas_safety': return extractGasSafety(text)
    case 'eicr': return extractEicr(text)
    case 'epc': return extractEpc(text)
    case 'pat': return extractPat(text)
    case 'hmo_licence': return extractHmoLicence(text)
    case 'fire_risk_assessment': return extractFra(text)
    default: return { fieldConfidence: {}, raw: {} }
  }
}
```

```ts
// lib/ocr/extract/gas-safety.ts
import { GAS_SAFETY_PATTERNS } from '@/lib/domain/compliance'  // already in tenureiq-domain
import type { Extracted } from './index'

export function extractGasSafety(text: string): Extracted {
  const norm = text.replace(/\s+/g, ' ')
  const out: Extracted = { fieldConfidence: {}, raw: {} }

  const issue = matchOne(norm, GAS_SAFETY_PATTERNS.issueDate)
  if (issue) {
    out.issueDate = normaliseDate(issue.value)
    out.raw.issueDate = issue.match
    out.fieldConfidence.issueDate = issue.score
  }

  const expiry = matchOne(norm, GAS_SAFETY_PATTERNS.expiryDate)
  if (expiry) {
    out.expiryDate = normaliseDate(expiry.value)
    out.raw.expiryDate = expiry.match
    out.fieldConfidence.expiryDate = expiry.score
  }
  // If only issue date found, derive expiry as +12 months (CP12 statutory period)
  else if (out.issueDate) {
    const d = new Date(out.issueDate)
    d.setFullYear(d.getFullYear() + 1)
    out.expiryDate = d.toISOString().slice(0, 10)
    out.raw.expiryDate = 'derived: issue + 12 months'
    out.fieldConfidence.expiryDate = 0.7  // derived, not extracted — lower confidence
  }

  const cert = matchOne(norm, GAS_SAFETY_PATTERNS.engineerNumber)
  if (cert) {
    out.certifier = cert.value
    out.raw.certifier = cert.match
    out.fieldConfidence.certifier = cert.score
  }

  return out
}

function matchOne(text: string, patterns: RegExp[]): { value: string; match: string; score: number } | null {
  for (const [i, pattern] of patterns.entries()) {
    const m = text.match(pattern)
    if (m && m[1]) {
      return {
        value: m[1].trim(),
        match: m[0],
        score: 1 - (i * 0.1),  // first pattern = highest score
      }
    }
  }
  return null
}

function normaliseDate(s: string): string {
  // Convert "12/03/2026", "12 March 2026", "Mar 12, 2026" → "2026-03-12"
  const d = new Date(s.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$3-$2-$1'))
  if (Number.isNaN(d.getTime())) return s
  return d.toISOString().slice(0, 10)
}
```

## Confidence scoring

Three signals combine into overall confidence:

```ts
// lib/ocr/confidence.ts
import type { Extracted } from './extract'

export function computeConfidence(ocrConfidence: number, extracted: Extracted): number {
  // 1. OCR raw confidence (Tesseract reports 0..1)
  const ocrScore = ocrConfidence

  // 2. Required-field presence: does every expected field have a value?
  const expectedFields = ['issueDate', 'expiryDate'] as const
  const present = expectedFields.filter((f) => extracted[f]).length
  const presenceScore = present / expectedFields.length

  // 3. Per-field confidence average
  const fieldScores = Object.values(extracted.fieldConfidence)
  const fieldAvg = fieldScores.length === 0 ? 0 : fieldScores.reduce((a, b) => a + b, 0) / fieldScores.length

  // Weighted: OCR raw counts most because if OCR is bad nothing else matters
  return 0.5 * ocrScore + 0.3 * presenceScore + 0.2 * fieldAvg
}
```

Threshold rules:

- `>= 0.85` → high confidence, can auto-create compliance_item (with audit log)
- `0.5 – 0.85` → surface in review queue with prefilled fields
- `< 0.5` → flag as needing manual entry, prefill what we have but don't trust it

## The confirm UI

```tsx
// app/(app)/documents/_components/extracted-fields-confirm.tsx
'use client'

import { useState, useTransition } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FormField } from '@/components/form-field'
import { confirmExtraction } from '../actions'

type Props = {
  documentId: string
  kind: string
  extracted: {
    issueDate?: string
    expiryDate?: string
    certifier?: string
    fieldConfidence: Record<string, number>
    raw: Record<string, string>
  }
  confidence: number
}

export function ExtractedFieldsConfirm({ documentId, kind, extracted, confidence }: Props) {
  const [, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const form = useForm({
    defaultValues: {
      issueDate: extracted.issueDate ?? '',
      expiryDate: extracted.expiryDate ?? '',
      certifier: extracted.certifier ?? '',
    },
  })

  const onSubmit = (values: any) => {
    startTransition(async () => {
      const result = await confirmExtraction({ documentId, ...values })
      if (result.ok) setDone(true)
    })
  }

  if (done) {
    return <p className="text-sm text-green-700">Saved. Compliance item created.</p>
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium capitalize">{kind.replace(/_/g, ' ')}</p>
        <Badge variant={confidence >= 0.85 ? 'default' : confidence >= 0.5 ? 'secondary' : 'destructive'}>
          {Math.round(confidence * 100)}% confidence
        </Badge>
      </div>

      <FormField name="issueDate" label="Issue date" required>
        <Input type="date" {...form.register('issueDate', { required: true })} />
        {extracted.fieldConfidence.issueDate < 0.8 && (
          <p className="text-xs text-amber-600 mt-1">
            Low confidence — please verify against the original document.
          </p>
        )}
      </FormField>

      <FormField name="expiryDate" label="Expiry date" required>
        <Input type="date" {...form.register('expiryDate', { required: true })} />
        {extracted.raw.expiryDate?.startsWith('derived:') && (
          <p className="text-xs text-amber-600 mt-1">
            Derived from issue date — not extracted directly from the document.
          </p>
        )}
      </FormField>

      <FormField name="certifier" label="Certifier / engineer number">
        <Input {...form.register('certifier')} />
      </FormField>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={() => /* mark reject */ {}}>
          Not a {kind.replace(/_/g, ' ')}
        </Button>
        <Button type="submit">Confirm and create compliance item</Button>
      </div>
    </form>
  )
}
```

## The confirm action

```ts
// app/(app)/documents/actions.ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'

const ConfirmSchema = z.object({
  documentId: z.string().uuid(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  certifier: z.string().optional(),
})

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export async function confirmExtraction(input: unknown): Promise<ActionResult<{ complianceItemId: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = ConfirmSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid input' }

  const sb = await supabaseServer()

  // Load the document — RLS scopes it to the org
  const { data: doc, error: docErr } = await sb
    .from('documents')
    .select('id, kind, property_id, unit_id')
    .eq('id', parsed.data.documentId)
    .single()
  if (docErr || !doc) return { ok: false, error: 'Document not found' }
  if (!doc.property_id) return { ok: false, error: 'Document not linked to a property' }

  // Create the compliance item
  const { data: item, error: itemErr } = await sb
    .from('compliance_items')
    .insert({
      organisation_id: auth.organisationId,
      property_id: doc.property_id,
      unit_id: doc.unit_id,
      kind: doc.kind,
      issue_date: parsed.data.issueDate,
      expiry_date: parsed.data.expiryDate,
      certifier: parsed.data.certifier || null,
      source_document_id: doc.id,
      status: 'valid',  // computed from expiry_date elsewhere, but seed as valid
    })
    .select('id')
    .single()
  if (itemErr || !item) return { ok: false, error: itemErr?.message ?? 'Insert failed' }

  // Mark the document confirmed
  await sb.from('documents').update({
    status: 'confirmed',
    confirmed_by: auth.userId,
    confirmed_at: new Date().toISOString(),
  }).eq('id', doc.id)

  revalidatePath('/documents')
  revalidatePath(`/properties/${doc.property_id}`)

  return { ok: true, data: { complianceItemId: item.id } }
}
```

## When to auto-confirm

For organisations with the `auto_confirm_high_confidence_ocr` setting enabled (default: false), `confidence >= 0.85` creates the compliance_item automatically — but always with the audit log recording it as an OCR-derived entry. The user can still review in the "Auto-created — review if needed" filter.

The default is **off** because legal consequences of a wrong expiry date matter more than the convenience of one click.

## Anti-patterns

1. Running OCR inline during upload — blocks the request for 5–60 seconds. Always async.
2. Auto-creating compliance items without user confirmation by default. Even at 99% confidence, the user owns the decision.
3. Showing the raw OCR text in the confirm UI. Users don't want to wade through it. Show the extracted fields and let them open the original document side-by-side.
4. Hardcoded date format assumptions. UK certs use DD/MM/YYYY but PDFs from US-built systems use MM/DD/YYYY. Normalise carefully or flag low confidence.
5. Throwing away the OCR text after extraction. Keep it on `documents.ocr_text` for audit and to re-run extraction with improved regex later.
6. Cloud OCR for everything. Cost scales linearly with volume; Tesseract handles 95% of clean PDFs.
