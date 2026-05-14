// lib/domain/lha.ts

export type LhaBedCategory = 'SAR' | '1B' | '2B' | '3B' | '4B'

export type LhaRate = {
  brmaCode: string
  beds: LhaBedCategory
  weeklyPence: bigint
  effectiveFrom: string // ISO date
  effectiveTo: string | null
}

/**
 * Look up the LHA rate for a BRMA + bed category as of a given date.
 * Returns the row whose effectiveFrom <= asOf < (effectiveTo ?? +∞).
 */
export function lhaRate(
  rates: LhaRate[],
  brmaCode: string,
  beds: LhaBedCategory,
  asOf: Date
): LhaRate | null {
  const candidates = rates.filter((r) => r.brmaCode === brmaCode && r.beds === beds)
  for (const c of candidates) {
    const from = new Date(c.effectiveFrom)
    const to = c.effectiveTo ? new Date(c.effectiveTo) : null
    if (from <= asOf && (!to || asOf < to)) return c
  }
  return null
}

/**
 * Weekly to monthly using the housing-benefit convention: weekly * 52 / 12.
 */
export function weeklyToMonthlyPence(weeklyPence: bigint): bigint {
  return (weeklyPence * 52n) / 12n
}
