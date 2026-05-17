// app/api/jobs/ocr/route.ts
// Thin route that triggers the OCR job. Called from the upload action
// via fetch(). Service-role logic lives in lib/jobs/ocr-document.ts.

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { env } from '@/env'
import { ocrDocument } from '@/lib/jobs/ocr-document'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Tesseract on a 4-page scanned PDF is ~30s; budget for it.
export const maxDuration = 300

type Body = { documentId?: string }

function verifySecret(req: Request): boolean {
  if (!env.CRON_SECRET) return false
  const header = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${env.CRON_SECRET}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!verifySecret(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }
  if (!body.documentId) {
    return NextResponse.json({ ok: false, error: 'documentId required' }, { status: 400 })
  }
  const result = await ocrDocument(body.documentId)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
