// lib/ocr/extract/gas-safety.ts
// Extracts issue date, next-inspection date, and engineer/issuer name
// from a typical UK CP12 gas safety certificate OCR'd to text.

import type { ExtractResult } from './index'
import { isoFromUkDate, addMonthsIso } from '../date-parsing'

const DATE_RE = /(\d{1,2}[\/\-\.\s]\d{1,2}[\/\-\.\s]\d{2,4}|\d{1,2}\s+[A-Za-z]+\s+\d{2,4})/

const ISSUE_LABELS = [
  /\binspection\s*date\b/i,
  /\bdate\s*of\s*inspection\b/i,
  /\binspection\s*completed\b/i,
  /\bissue(d)?\s*date\b/i,
  /\bdate\s*of\s*issue\b/i,
]

const EXPIRY_LABELS = [
  /\bnext\s*inspection\s*(?:due|date)?\b/i,
  /\bvalid\s*until\b/i,
  /\bexpiry\s*date\b/i,
  /\brecommended\s*next\s*test\b/i,
]

const ENGINEER_LABEL = /\bengineer(?:\s*name)?\s*[:\-]?\s*([A-Za-z][A-Za-z\s\-']{2,80})/i
const COMPANY_LABEL = /\bcompany\s*(?:name)?\s*[:\-]?\s*([A-Za-z][A-Za-z0-9\s&\-'.,]{2,120})/i

function findDateNearLabel(text: string, labels: RegExp[]): string | null {
  for (const label of labels) {
    const labelMatch = label.exec(text)
    if (!labelMatch) continue
    const window = text.slice(labelMatch.index, labelMatch.index + 120)
    const dateMatch = DATE_RE.exec(window)
    if (!dateMatch) continue
    const raw = dateMatch[1]; if (!raw) continue; const iso = isoFromUkDate(raw)
    if (iso) return iso
  }
  return null
}

export function extractGasSafety(text: string): ExtractResult {
  const issueDate = findDateNearLabel(text, ISSUE_LABELS)
  let expiryDate = findDateNearLabel(text, EXPIRY_LABELS)

  // Derive expiry = issue + 12 months when issue is found but no explicit
  // expiry. Marks the field as derived (lower confidence).
  let expiryDerived = false
  if (!expiryDate && issueDate) {
    expiryDate = addMonthsIso(issueDate, 12)
    expiryDerived = true
  }

  const engineerMatch = ENGINEER_LABEL.exec(text)
  const companyMatch = COMPANY_LABEL.exec(text)
  const issuer = (companyMatch?.[1] ?? engineerMatch?.[1] ?? null)?.trim() ?? null

  // Confidence: 30% for issue, 30% for expiry (10% penalty if derived),
  // 20% for issuer, 20% base from "the text looked like a gas-safety
  // certificate at all" (presence of a label).
  let bps = 2000
  if (issueDate) bps += 3000
  if (expiryDate) bps += expiryDerived ? 2000 : 3000
  if (issuer) bps += 2000

  return {
    extracted: {
      issueDate,
      expiryDate,
      issuer,
      raw: {
        derived_expiry: expiryDerived ? 'true' : 'false',
        engineer: engineerMatch?.[1]?.trim() ?? '',
        company: companyMatch?.[1]?.trim() ?? '',
      },
    },
    fieldConfidenceBps: Math.min(10_000, bps),
  }
}
