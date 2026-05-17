// lib/ocr/extract/index.ts
// Per-compliance-kind text extractors. Each takes the raw OCR text and
// returns a structured `Extracted` plus a 0..1 confidence score.
// Regex-driven; no model dependency. The full Tesseract integration
// (lib/ocr/tesseract.ts) and the cloud-OCR fallback (lib/ocr/cloud.ts)
// are queued for a follow-up pass with real fixture files.

import { extractGasSafety } from './gas-safety'
import { extractEicr } from './eicr'
import { extractEpc } from './epc'
import { extractGeneric } from './generic'

export type Extracted = {
  issueDate: string | null   // ISO date (YYYY-MM-DD)
  expiryDate: string | null
  issuer: string | null
  raw: Record<string, string>
}

export type ExtractResult = {
  extracted: Extracted
  // 0..10000 (basis points). Combined with OCR-engine confidence to get
  // the document's overall confidenceBps.
  fieldConfidenceBps: number
}

type Extractor = (text: string) => ExtractResult

const REGISTRY: Record<string, Extractor> = {
  gas_safety: extractGasSafety,
  eicr: extractEicr,
  epc: extractEpc,
}

export function extractByKind(kind: string, text: string): ExtractResult {
  const fn = REGISTRY[kind] ?? extractGeneric
  return fn(text)
}

export { extractGasSafety, extractEicr, extractEpc, extractGeneric }
