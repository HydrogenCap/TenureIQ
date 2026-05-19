// lib/ocr/tesseract.ts
// Tesseract.js wrapper. Service-side only — tesseract.js loads a ~10MB
// WASM binary plus a per-language model (~10MB for eng), so we never
// want this anywhere near the client bundle.
//
// API surface kept tiny: `runTesseractOnBuffer(buffer, mime)` returns
// `{ text, confidenceBps }`. Worker lifecycle is managed internally —
// one shared worker is created on first call and reused for the rest of
// the process lifetime.
//
// Confidence is returned by tesseract.js as a 0-100 average over all
// recognised words; we convert to the project's bps (0-10000)
// convention.

import 'server-only'
import { createWorker, type Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise
  workerPromise = (async () => {
    // 'eng' is sufficient for UK property compliance certs (GSC, EICR,
    // EPC, deposit certificates — all in English).
    const w = await createWorker('eng')
    return w
  })()
  return workerPromise
}

export type TesseractResult = {
  text: string
  confidenceBps: number
}

export async function runTesseractOnBuffer(
  buffer: ArrayBuffer | Uint8Array,
  mime: string,
): Promise<TesseractResult> {
  // Tesseract.js doesn't natively read HEIC/HEIF. If we see one we'd
  // need to convert via sharp first — we don't ship sharp yet, so let
  // the call fail cleanly and let the user fill the form manually.
  if (mime === 'image/heic' || mime === 'image/heif') {
    throw new Error('HEIC / HEIF not yet supported — convert to JPEG/PNG and re-upload.')
  }

  const worker = await getWorker()
  const input = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const result = await worker.recognize(Buffer.from(input))
  const pct = typeof result.data.confidence === 'number' ? result.data.confidence : 0
  return {
    text: result.data.text ?? '',
    // Tesseract gives 0-100; convert to 0-10000 bps.
    confidenceBps: Math.max(0, Math.min(10_000, Math.round(pct * 100))),
  }
}
