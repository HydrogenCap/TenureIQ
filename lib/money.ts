// lib/money.ts
// Conversions between pence (canonical, bigint) and GBP for UI display.

export const toPence = (gbp: number): bigint => BigInt(Math.round(gbp * 100))

export const toGbp = (pence: bigint): number => Number(pence) / 100

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
