// lib/domain/equity.ts

export type EquityInput = {
  valuationPence: bigint
  balancePence: bigint
}

export function equity({ valuationPence, balancePence }: EquityInput): bigint {
  return valuationPence - balancePence
}

/**
 * Loan-to-value as a ratio in basis points (0–10000+).
 * 80% LTV = 8000 bps.
 */
export function ltvBps({ valuationPence, balancePence }: EquityInput): number {
  if (valuationPence === 0n) return 0
  return Number((balancePence * 10000n) / valuationPence)
}

/**
 * Stressed LTV: simulates valuation decline by stressPct%, returns LTV after.
 * stressBps applied negatively to valuation.
 */
export function stressedLtvBps(input: EquityInput & { stressBps: number }): number {
  const stressed = (input.valuationPence * BigInt(10000 - input.stressBps)) / 10000n
  if (stressed === 0n) return 0
  return Number((input.balancePence * 10000n) / stressed)
}
