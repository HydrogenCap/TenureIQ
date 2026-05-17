// lib/ocr/date-parsing.ts
// UK-locale date parsers for OCR'd text. Avoids `Date.parse` directly
// because it interprets "01/03/2024" as Jan 3rd (US locale).

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (year < 100) year = year >= 50 ? 1900 + year : 2000 + year
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (year < 1900 || year > 2100) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function parseUkDate(input: string): { year: number; month: number; day: number } | null {
  const s = input.trim()
  // Numeric DD/MM/YYYY (or DD-MM-YYYY, DD.MM.YYYY, DD MM YYYY)
  const numeric = /^(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{2,4})$/.exec(s)
  if (numeric) {
    const d = parseInt(numeric[1] ?? '', 10)
    const m = parseInt(numeric[2] ?? '', 10)
    const y = parseInt(numeric[3] ?? '', 10)
    return { day: d, month: m, year: y }
  }
  // Worded "1 March 2024" / "01 Mar 2024"
  const worded = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/.exec(s)
  if (worded) {
    const d = parseInt(worded[1] ?? '', 10)
    const m = MONTHS[(worded[2] ?? '').toLowerCase()]
    const y = parseInt(worded[3] ?? '', 10)
    if (!m) return null
    return { day: d, month: m, year: y }
  }
  return null
}

export function isoFromUkDate(input: string): string | null {
  const p = parseUkDate(input)
  if (!p) return null
  return isoFromParts(p.year, p.month, p.day)
}

export function addMonthsIso(iso: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const y = parseInt(m[1] ?? '', 10)
  const mo = parseInt(m[2] ?? '', 10)
  const d = parseInt(m[3] ?? '', 10)
  // Use UTC to avoid DST edge-cases.
  const date = new Date(Date.UTC(y, mo - 1, d))
  date.setUTCMonth(date.getUTCMonth() + months)
  const yr = date.getUTCFullYear()
  const mn = date.getUTCMonth() + 1
  const dy = date.getUTCDate()
  return `${yr}-${pad2(mn)}-${pad2(dy)}`
}
