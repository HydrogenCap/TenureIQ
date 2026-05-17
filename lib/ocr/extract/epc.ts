// lib/ocr/extract/epc.ts
// Energy Performance Certificate — valid 10 years from lodgement.

import type { ExtractResult } from './index'
import { isoFromUkDate, addMonthsIso } from '../date-parsing'

const DATE_RE = /(\d{1,2}[\/\-\.\s]\d{1,2}[\/\-\.\s]\d{2,4}|\d{1,2}\s+[A-Za-z]+\s+\d{2,4})/

const ISSUE_LABELS = [
  /\bdate\s*of\s*(?:assessment|certificate|lodgement)\b/i,
  /\bassessment\s*date\b/i,
  /\bissued?\s*on\b/i,
  /\bcertificate\s*date\b/i,
]

const EXPIRY_LABELS = [
  /\bvalid\s*until\b/i,
  /\bcertificate\s*expires?\b/i,
  /\bexpir(y|es)\s*date\b/i,
]

const RATING_RE = /\b(?:current|asset)?\s*(?:energy\s*efficiency\s*)?rating\b[:\s]*([A-G])\b/i
const ASSESSOR_LABEL = /\bassessor(?:'s)?\s*name\s*[:\-]?\s*([A-Za-z][A-Za-z\s\-']{2,80})/i

function findDateNearLabel(text: string, labels: RegExp[]): string | null {
  for (const label of labels) {
    const m = label.exec(text)
    if (!m) continue
    const w = text.slice(m.index, m.index + 160)
    const dm = DATE_RE.exec(w)
    if (!dm) continue
    const raw = dm[1]; if (!raw) continue; const iso = isoFromUkDate(raw)
    if (iso) return iso
  }
  return null
}

export function extractEpc(text: string): ExtractResult {
  const issueDate = findDateNearLabel(text, ISSUE_LABELS)
  let expiryDate = findDateNearLabel(text, EXPIRY_LABELS)

  // EPCs are valid for 10 years from lodgement.
  let expiryDerived = false
  if (!expiryDate && issueDate) {
    expiryDate = addMonthsIso(issueDate, 120)
    expiryDerived = true
  }

  const ratingMatch = RATING_RE.exec(text)
  const assessorMatch = ASSESSOR_LABEL.exec(text)
  const issuer = assessorMatch?.[1]?.trim() ?? null

  let bps = 2000
  if (issueDate) bps += 3000
  if (expiryDate) bps += expiryDerived ? 1500 : 3000
  if (ratingMatch) bps += 1000
  if (issuer) bps += 1500

  return {
    extracted: {
      issueDate,
      expiryDate,
      issuer,
      raw: {
        derived_expiry: expiryDerived ? 'true' : 'false',
        rating: ratingMatch?.[1] ?? '',
      },
    },
    fieldConfidenceBps: Math.min(10_000, bps),
  }
}
