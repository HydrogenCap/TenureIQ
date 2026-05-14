// lib/domain/section24.ts
// Section 24 / individual landlord mortgage interest restriction.

export type IndividualTaxInput = {
  grossRentPence: bigint
  mortgageInterestPence: bigint
  otherCostsPence: bigint
  marginalRateBps: number // 2000 basic, 4000 higher, 4500 additional
}

export type IndividualTaxResult = {
  taxableProfitPence: bigint
  taxBeforeCreditPence: bigint
  interestCreditPence: bigint
  netTaxPence: bigint
  effectiveRateOnRentBps: number
}

/**
 * Computes UK individual landlord tax under Section 24 (post-2020).
 * Mortgage interest is NOT deductible; a 20% credit is given.
 */
export function individualLandlordTax(input: IndividualTaxInput): IndividualTaxResult {
  // Interest NOT deducted from taxable profit
  const taxableProfitPence = input.grossRentPence - input.otherCostsPence
  const taxBeforeCreditPence =
    taxableProfitPence > 0n
      ? (taxableProfitPence * BigInt(input.marginalRateBps)) / 10000n
      : 0n
  // 20% interest credit
  const interestCreditPence = (input.mortgageInterestPence * 2000n) / 10000n
  const rawNet = taxBeforeCreditPence - interestCreditPence
  const netTaxPence = rawNet > 0n ? rawNet : 0n
  const effectiveRateOnRentBps =
    input.grossRentPence === 0n
      ? 0
      : Number((netTaxPence * 10000n) / input.grossRentPence)
  return {
    taxableProfitPence,
    taxBeforeCreditPence,
    interestCreditPence,
    netTaxPence,
    effectiveRateOnRentBps,
  }
}

export type CompanyTaxInput = {
  grossRentPence: bigint
  mortgageInterestPence: bigint
  otherCostsPence: bigint
  ctRateBps: number // e.g. 1900 small profits, 2500 main
}

export type CompanyTaxResult = {
  taxableProfitPence: bigint
  netTaxPence: bigint
}

export function companyLandlordTax(input: CompanyTaxInput): CompanyTaxResult {
  const taxableProfitPence =
    input.grossRentPence - input.mortgageInterestPence - input.otherCostsPence
  const netTaxPence =
    taxableProfitPence > 0n
      ? (taxableProfitPence * BigInt(input.ctRateBps)) / 10000n
      : 0n
  return { taxableProfitPence, netTaxPence }
}

/**
 * The Section 24 "cost" = the additional tax an individual landlord pays
 * vs the pre-S24 deduction method. Returns 0 for basic-rate taxpayers.
 */
export function section24CostPence(input: IndividualTaxInput): bigint {
  if (input.marginalRateBps <= 2000) return 0n

  // Pre-S24: interest IS deducted
  const preProfit = input.grossRentPence - input.mortgageInterestPence - input.otherCostsPence
  const preTax = preProfit > 0n ? (preProfit * BigInt(input.marginalRateBps)) / 10000n : 0n

  // Post-S24
  const post = individualLandlordTax(input)

  const diff = post.netTaxPence - preTax
  return diff > 0n ? diff : 0n
}
