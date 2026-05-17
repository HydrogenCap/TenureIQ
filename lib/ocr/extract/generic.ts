// lib/ocr/extract/generic.ts
// Fallback extractor for compliance kinds without a dedicated regex
// pack yet (pat, fire_alarm, fire_risk_assessment, legionella, …).
// Tries common issue/expiry label patterns; returns low confidence so
// the UI always asks the user to confirm.

import type { ExtractResult } from './index'
import { isoFromUkDate } from '../date-parsing'

const DATE_RE = /(\d{1,2}[\/\-\.\s]\d{1,2}[\/\-\.\s]\d{2,4}|\d{1,2}\s+[A-Za-z]+\s+\d{2,4})/

const ISSUE_LABELS = [
  /\bdate\s*of\s*(?:inspection|test|assessment|issue)\b/i,
  /\binspection\s*date\b/i,
  /\bcompleted\s*(?:on)?\b/i,
  /\bissued?\s*(?:on|date)?\b/i,
]

const EXPIRY_LABELS = [
  /\bnext\s*(?:test|inspection)\s*(?:due|date)?\b/i,
  /\bvalid\s*until\b/i,
  /\bexpiry\s*date\b/i,
  /\bdue\s*(?:by|date)\b/i,
]

function findDateNearLabel(text: string, labels: RegExp[]): string | null {
  for (const label of labels) {
    const m = label.exec(text)
    if (!m) continue
    const w = text.slice(m.index, m.index + 140)
    const dm = DATE_RE.exec(w)
    if (!dm) continue
    const raw = dm[1]; if (!raw) continue; const iso = isoFromUkDate(raw)
    if (iso) return iso
  }
  return null
}

export function extractGeneric(text: string): ExtractResult {
  const issueDate = findDateNearLabel(text, ISSUE_LABELS)
  const expiryDate = findDateNearLabel(text, EXPIRY_LABELS)

  let bps = 1000
  if (issueDate) bps += 2000
  if (expiryDate) bps += 2000

  return {
    extracted: {
      issueDate,
      expiryDate,
      issuer: null,
      raw: {},
    },
    fieldConfidenceBps: bps,
  }
}
