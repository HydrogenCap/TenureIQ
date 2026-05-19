// lib/ocr/pdf-text.ts
// Try to pull the embedded text layer out of a PDF without rasterising.
// Most UK compliance certs from issuers like Gas Safe / NICEIC / Domestic
// Energy Assessors are generated as text PDFs (not scans), so this is
// the fast path that avoids tesseract entirely.
//
// Returns null when the PDF has no usable text layer (e.g. it is a
// scan-of-paper PDF). The caller falls through to tesseract+rasterise.

import 'server-only'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export type PdfTextResult = {
  text: string
  // We trust embedded text fully — it's the source, not an OCR guess.
  confidenceBps: 10_000
} | null

// Threshold below which we treat the PDF as text-less. Scanned PDFs
// often have a sprinkling of metadata text (a couple of stamps, "Page 1
// of 2", etc) but no body content. 40 chars is a conservative floor.
const MIN_USEFUL_CHARS = 40

// Defensive shape — pdfjs `getTextContent()` returns items that are
// either TextItem (has `.str`) or TextMarkedContent (no `.str`). We
// only care about the strings; using a structural runtime check
// instead of a cast keeps the convention's no-broad-cast rule.
function itemStr(item: unknown): string {
  if (typeof item === 'object' && item !== null && 'str' in item) {
    const s = (item as { str: unknown }).str
    return typeof s === 'string' ? s : ''
  }
  return ''
}

export async function extractEmbeddedPdfText(
  buffer: ArrayBuffer | Uint8Array,
): Promise<PdfTextResult> {
  const data =
    buffer instanceof Uint8Array
      ? new Uint8Array(buffer) // copy so pdfjs doesn't transfer ownership
      : new Uint8Array(buffer)

  const loadingTask = getDocument({
    data,
    useSystemFonts: false,
  })

  let pdf
  try {
    pdf = await loadingTask.promise
  } catch {
    return null
  }

  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: unknown) => itemStr(item))
      .filter((s) => s.length > 0)
      .join(' ')
    pageTexts.push(pageText.trim())
    page.cleanup()
  }
  await pdf.destroy()

  const joined = pageTexts.filter((p) => p.length > 0).join('\n\n').trim()
  if (joined.length < MIN_USEFUL_CHARS) return null
  return { text: joined, confidenceBps: 10_000 }
}
