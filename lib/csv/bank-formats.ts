// lib/csv/bank-formats.ts
//
// Per-bank header signatures + row mappers. Each bank exports a
// slightly different CSV shape — date column name, sign convention,
// description-vs-reference split, currency column. We detect the
// format by hashing the header row against the known signatures, then
// route through the matching mapper. Unknown formats fall back to the
// generic mapper (which expects canonical columns and relies on the
// import wizard's column-mapper UI to relabel headers).
//
// Adding a new bank = one entry here + the matching mapper + a header
// fixture in lib/csv/bank-formats.test.ts.

export type BankFormatId = 'monzo' | 'starling' | 'hsbc' | 'generic'

// `headers` is the lowercase, trimmed header row from the CSV.
// `signatureCols` are the header names whose presence (in lowercase,
// trimmed) is sufficient to identify the format.
type Signature = {
  id: BankFormatId
  label: string
  signatureCols: string[]
}

const SIGNATURES: Signature[] = [
  {
    id: 'monzo',
    label: 'Monzo',
    // Monzo exports include "Transaction ID", "Amount" (signed), and a
    // distinctive "Notes and #tags" column.
    signatureCols: ['transaction id', 'amount', 'notes and #tags'],
  },
  {
    id: 'starling',
    label: 'Starling',
    // Starling export header: "Date","Counter Party","Reference",
    // "Type","Amount (GBP)","Balance (GBP)",...
    signatureCols: ['counter party', 'amount (gbp)', 'balance (gbp)'],
  },
  {
    id: 'hsbc',
    label: 'HSBC',
    // HSBC business banking: "Date","Type","Description","Paid out",
    // "Paid in","Balance".
    signatureCols: ['paid out', 'paid in', 'balance'],
  },
]

export function detectBankFormat(headers: string[]): {
  id: BankFormatId
  label: string
} {
  const norm = new Set(headers.map((h) => h.toLowerCase().trim()))
  for (const sig of SIGNATURES) {
    if (sig.signatureCols.every((c) => norm.has(c))) {
      return { id: sig.id, label: sig.label }
    }
  }
  return { id: 'generic', label: 'Generic' }
}

// =========================================================================
// Per-format row mappers
// =========================================================================
//
// Each mapper takes a single row keyed by the original header name and
// returns a canonical row shape suitable for inserting into the
// transaction_import_rows staging table:
//
//   {
//     posted_at: 'YYYY-MM-DD',
//     description: string,
//     amount_pence: bigint  (signed: positive = credit, negative = debit),
//     external_id: string | null,    // bank's own row id (for dedup)
//     reference: string | null,
//   }
//
// Returning null = the row is skipped (e.g. a header-repeat line in
// HSBC exports, or a blank line).

export type CanonicalRow = {
  postedAt: string // ISO date
  description: string
  amountPence: bigint
  externalId: string | null
  reference: string | null
}

function pickKey(row: Record<string, string>, key: string): string {
  const direct = row[key]
  if (direct !== undefined && direct !== '') return direct
  // Try common case variants.
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().trim() === key.toLowerCase().trim()) {
      return row[k] ?? ''
    }
  }
  return ''
}

function parseUkDate(raw: string): string | null {
  // Accepts DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, or "1 Mar 2024".
  if (!raw) return null
  const trimmed = raw.trim()
  // ISO already?
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (iso) return trimmed
  const slash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(trimmed)
  if (slash) {
    let yyyy = parseInt(slash[3] ?? '', 10)
    if (yyyy < 100) yyyy += yyyy >= 70 ? 1900 : 2000
    const mm = parseInt(slash[2] ?? '', 10)
    const dd = parseInt(slash[1] ?? '', 10)
    if (!Number.isFinite(yyyy) || !Number.isFinite(dd) || !Number.isFinite(mm) || dd < 1 || dd > 31 || mm < 1 || mm > 12) return null
    return `${yyyy.toString().padStart(4, '0')}-${mm.toString().padStart(2, '0')}-${dd.toString().padStart(2, '0')}`
  }
  // Long form: "1 Mar 2024"
  const longForm = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/.exec(trimmed)
  if (longForm) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const m = months.indexOf((longForm[2] ?? '').toLowerCase().slice(0, 3))
    if (m < 0) return null
    let yyyy = parseInt(longForm[3] ?? '', 10)
    if (yyyy < 100) yyyy += yyyy >= 70 ? 1900 : 2000
    const dd = parseInt(longForm[1] ?? '', 10)
    if (!Number.isFinite(yyyy) || !Number.isFinite(dd)) return null
    return `${yyyy.toString().padStart(4, '0')}-${(m + 1).toString().padStart(2, '0')}-${dd.toString().padStart(2, '0')}`
  }
  return null
}

function moneyToPence(raw: string): bigint | null {
  // String-based parse — avoid float round-trip so a value like "0.10"
  // doesn't drift to 9 or 11 pence at parse time.
  if (!raw) return null
  const cleaned = raw.replace(/[£,\s]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned)
  if (!m) return null
  const sign = m[1] === '-' ? -1n : 1n
  const whole = m[2] ?? '0'
  // Truncate / pad the fractional part to exactly 2 digits — drop
  // anything beyond hundredths rather than risk a banker's-round bug.
  const fracRaw = (m[3] ?? '').slice(0, 2).padEnd(2, '0')
  return sign * (BigInt(whole) * 100n + BigInt(fracRaw))
}

// Parse an integer pence column. Rejects decimals so a user accidentally
// passing pounds (e.g. "12.34") doesn't get silently coerced to 12 pence.
function integerPenceToPence(raw: string): bigint | null {
  if (!raw) return null
  const cleaned = raw.replace(/[,\s]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  if (!/^-?\d+$/.test(cleaned)) return null
  return BigInt(cleaned)
}

function mapMonzo(row: Record<string, string>): CanonicalRow | null {
  const postedAt = parseUkDate(pickKey(row, 'Date'))
  const amount = moneyToPence(pickKey(row, 'Amount'))
  if (!postedAt || amount === null) return null
  const desc =
    pickKey(row, 'Description') ||
    pickKey(row, 'Name') ||
    pickKey(row, 'Notes and #tags') ||
    '(no description)'
  return {
    postedAt,
    description: desc,
    amountPence: amount,
    externalId: pickKey(row, 'Transaction ID') || null,
    reference: pickKey(row, 'Reference') || null,
  }
}

function mapStarling(row: Record<string, string>): CanonicalRow | null {
  const postedAt = parseUkDate(pickKey(row, 'Date'))
  const amount = moneyToPence(pickKey(row, 'Amount (GBP)'))
  if (!postedAt || amount === null) return null
  const counter = pickKey(row, 'Counter Party')
  const ref = pickKey(row, 'Reference')
  return {
    postedAt,
    description: counter || ref || '(no description)',
    amountPence: amount,
    externalId: null, // Starling exports don't include a stable row id
    reference: ref || null,
  }
}

function mapHsbc(row: Record<string, string>): CanonicalRow | null {
  const postedAt = parseUkDate(pickKey(row, 'Date'))
  const paidOut = moneyToPence(pickKey(row, 'Paid out'))
  const paidIn = moneyToPence(pickKey(row, 'Paid in'))
  if (!postedAt) return null
  // HSBC uses two separate columns instead of a signed value. Treat
  // 'Paid out' as negative, 'Paid in' as positive. If both are blank,
  // skip (rolling-balance row).
  let amount: bigint
  if (paidOut !== null && paidOut > 0n) amount = -paidOut
  else if (paidIn !== null && paidIn > 0n) amount = paidIn
  else return null
  const desc = pickKey(row, 'Description') || '(no description)'
  return {
    postedAt,
    description: desc,
    amountPence: amount,
    externalId: null,
    reference: pickKey(row, 'Type') || null,
  }
}

function mapGeneric(row: Record<string, string>): CanonicalRow | null {
  // Canonical columns — used when the user's CSV doesn't match any
  // detected format. The wizard's column-mapper screen renames the
  // user's headers into these before this mapper runs.
  //
  // Amount handling distinguishes by COLUMN NAME, matching what the
  // name promises (caught by PR #1 review — `amount_pence` was being
  // parsed as GBP, inflating every imported transaction 100×):
  //   - amount_pence    → integer pence, no decimals (rejects "12.34")
  //   - amount_gbp / amount / Amount → pounds with decimals
  //
  // We prefer amount_pence when both are present; otherwise fall through
  // to the GBP parsers.
  const postedAt = parseUkDate(pickKey(row, 'posted_at') || pickKey(row, 'Date'))
  let amount: bigint | null = null
  const rawIntPence = pickKey(row, 'amount_pence')
  if (rawIntPence) {
    amount = integerPenceToPence(rawIntPence)
  } else {
    amount = moneyToPence(
      pickKey(row, 'amount_gbp') || pickKey(row, 'amount') || pickKey(row, 'Amount'),
    )
  }
  if (!postedAt || amount === null) return null
  return {
    postedAt,
    description: pickKey(row, 'description') || pickKey(row, 'Description') || '(no description)',
    amountPence: amount,
    externalId: pickKey(row, 'external_id') || null,
    reference: pickKey(row, 'reference') || null,
  }
}

const MAPPERS: Record<BankFormatId, (row: Record<string, string>) => CanonicalRow | null> = {
  monzo: mapMonzo,
  starling: mapStarling,
  hsbc: mapHsbc,
  generic: mapGeneric,
}

export function mapBankRow(
  format: BankFormatId,
  row: Record<string, string>,
): CanonicalRow | null {
  return MAPPERS[format](row)
}
