// lib/money.ts
// Conversions between pence (canonical, bigint) and GBP for UI display,
// plus the Zod preprocessor pair every form/CSV schema uses to coerce
// user input into bigint pence.

export const toGbp = (pence: bigint): number => Number(pence) / 100

// String-based "string-or-numeric → bigint pence" parser. We avoid
// `Number(x) * 100` because of the IEEE-754 round-trip:
//   Number('1.235') * 100 === 123.49999999999999 → Math.round → 123 (off by 1)
// Truncating after the second decimal matches the bank-formats parser.
function parsePenceString(s: string): bigint | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s)
  if (!m) return null
  const sign = m[1] === '-' ? -1n : 1n
  const whole = m[2] ?? '0'
  const fracRaw = (m[3] ?? '').slice(0, 2).padEnd(2, '0')
  return sign * (BigInt(whole) * 100n + BigInt(fracRaw))
}

// Required pence preprocessor for z.preprocess(...). Returns:
//   - bigint unchanged (already canonical)
//   - parsed bigint for number / numeric-string inputs
//   - the original value for null / undefined / un-parseable strings so
//     the downstream z.bigint() raises a readable error.
//
// Strips £ / commas / whitespace from string input before parsing so
// users can paste copy-paste-friendly values like "£1,250.50".
export function pencePreprocessor(v: unknown): unknown {
  if (v === null || v === undefined) return v
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return v
    // Number → string before parsing dodges the float multiply drift.
    return parsePenceString(v.toString()) ?? v
  }
  if (typeof v === 'string') {
    const cleaned = v.replace(/[£,\s]/g, '')
    if (cleaned === '' || cleaned === '-') return v
    return parsePenceString(cleaned) ?? v
  }
  return v
}

// Optional-pence variant — treats null / undefined / empty string as
// null so the downstream z.bigint().nullable() accepts them.
export function optionalPencePreprocessor(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null
  return pencePreprocessor(v)
}

// Percent → basis points (5.25% → 525 bps). Same string-based parser
// as the pence helper to avoid the IEEE-754 float-multiply drift:
//   Number('5.235') * 100 === 523.5000000000001
// Strips '%' and whitespace from string input so users can paste
// "5.25%" or "  5.25 " interchangeably.
//
// Returned shape mirrors pencePreprocessor:
//   - number unchanged if it's an integer already > 0 (defensive — a
//     caller passing already-bps ints by accident wouldn't be
//     intercepted; the regex parses numbers as percent decimals)
//   - parsed int for number / numeric-string inputs (rounded to bps)
//   - original value for un-parseable / null / undefined so the
//     downstream z.number().int() raises a readable error.
function parsePercentToBps(s: string): number | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s)
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const whole = parseInt(m[2] ?? '0', 10)
  // Truncate / pad fractional part to exactly 2 digits so 5.255 → 525
  // (not 526). 2dp is the bps granularity ceiling — anything beyond
  // is sub-bps and unrepresentable.
  const fracRaw = (m[3] ?? '').slice(0, 2).padEnd(2, '0')
  const frac = parseInt(fracRaw, 10)
  return sign * (whole * 100 + frac)
}

export function bpsFromPercentPreprocessor(v: unknown): unknown {
  if (v === null || v === undefined) return v
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return v
    return parsePercentToBps(v.toString()) ?? v
  }
  if (typeof v === 'string') {
    const cleaned = v.replace(/[%\s]/g, '')
    if (cleaned === '' || cleaned === '-') return v
    return parsePercentToBps(cleaned) ?? v
  }
  return v
}

export function optionalBpsFromPercentPreprocessor(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null
  return bpsFromPercentPreprocessor(v)
}

export const formatGbp = (pence: bigint | null | undefined): string => {
  if (pence === null || pence === undefined) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(toGbp(pence))
}

export const formatGbpPrecise = (pence: bigint | null | undefined): string => {
  if (pence === null || pence === undefined) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(toGbp(pence))
}

export const bpsToPercent = (bps: number): string => `${(bps / 100).toFixed(2)}%`

export const percentToBps = (pct: number): number => Math.round(pct * 100)

// Safe bigint multiply by basis points: (value * bps) / 10000, integer rounding.
export const multiplyByBps = (value: bigint, bps: number): bigint => {
  return (value * BigInt(bps)) / 10000n
}
