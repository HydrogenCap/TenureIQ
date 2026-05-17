// lib/ocr/extract/eicr.ts
// Electrical Installation Condition Report — typical 5-year cycle for
// rental properties under the Electrical Safety Standards in the
// Private Rented Sector (England) Regulations 2020.

import type { ExtractResult } from './index'
import { isoFromUkDate, addMonthsIso } from '../date-parsing'

const DATE_RE = /(\d{1,2}[\/\-\.\s]\d{1,2}[\/\-\.\s]\d{2,4}|\d{1,2}\s+[A-Za-z]+\s+\d{2,4})/

const ISSUE_LABELS = [
  /\bdate\s*of\s*inspection\b/i,
  /\binspection\s*date\b/i,
  /\bdate\s*completed\b/i,
  /\bissued?\s*(on|date)?\b/i,
]

const EXPIRY_LABELS = [
  /\bnext\s*inspection\s*(?:due|date|recommended)?\b/i,
  /\brecommended\s*re-?test\s*period\b/i,
  /\bvalid\s*until\b/i,
  /\bperiodic\s*inspection\s*(?:due|date)?\b/i,
]

const COMPANY_LABEL = /\b(?:contractor|company)\s*(?:name)?\s*[:\-]?\s*([A-Za-z][A-Za-z0-9\s&\-'.,]{2,120})/i
const NICEIC_NUMBER = /\b(NICEIC|NAPIT|ELECSA|STROMA)\s*(?:no|number|reg|enrolment)?\s*[:\-]?\s*([A-Z0-9\-]{4,20})/i

function findDateNearLabel(text: string, labels: RegExp[]): string | null {
  for (const label of labels) {
    const m = label.exec(text)
    if (!m) continue
    const window = text.slice(m.index, m.index + 160)
    const dm = DATE_RE.exec(window)
    if (!dm) continue
    const raw = dm[1]; if (!raw) continue; const iso = isoFromUkDate(raw)
    if (iso) return iso
  }
  return null
}

export function extractEicr(text: string): ExtractResult {
  const issueDate = findDateNearLabel(text, ISSUE_LABELS)
  let expiryDate = findDateNearLabel(text, EXPIRY_LABELS)

  // EICRs are routinely valid for 5 years (60 months) in residential
  // settings. Some inspectors recommend 3 years — only derive when we
  // have no explicit expiry text at all.
  let expiryDerived = false
  if (!expiryDate && issueDate) {
    expiryDate = addMonthsIso(issueDate, 60)
    expiryDerived = true
  }

  const companyMatch = COMPANY_LABEL.exec(text)
  const niceicMatch = NICEIC_NUMBER.exec(text)
  const issuer = companyMatch?.[1]?.trim() ?? null

  let bps = 2000
  if (issueDate) bps += 3000
  if (expiryDate) bps += expiryDerived ? 1500 : 3000
  if (issuer) bps += 1500
  if (niceicMatch) bps += 500

  return {
    extracted: {
      issueDate,
      expiryDate,
      issuer,
      raw: {
        derived_expiry: expiryDerived ? 'true' : 'false',
        accreditation: niceicMatch ? `${niceicMatch[1]} ${niceicMatch[2]}` : '',
      },
    },
    fieldConfidenceBps: Math.min(10_000, bps),
  }
}
