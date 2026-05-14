// lib/domain/sdlt.ts
// England & Northern Ireland SDLT for property purchase.
// MDR abolished June 2024 — not implemented.

export type BuyerKind =
  | 'individual_first_property'
  | 'individual_additional'
  | 'company'

export type SdltInput = {
  pricePence: bigint
  dwellingCount: number
  buyerKind: BuyerKind
}

type Band = {
  fromPence: bigint
  toPence: bigint | null // null = no upper bound
  baseRateBps: number
  surchargeBps: number // applied if buyerKind is additional or company
}

// Current residential bands (post-April 2025)
const RESIDENTIAL_BANDS: Band[] = [
  { fromPence: 0n, toPence: 12_500_000n, baseRateBps: 0, surchargeBps: 500 },
  { fromPence: 12_500_000n, toPence: 25_000_000n, baseRateBps: 200, surchargeBps: 500 },
  { fromPence: 25_000_000n, toPence: 92_500_000n, baseRateBps: 500, surchargeBps: 500 },
  { fromPence: 92_500_000n, toPence: 150_000_000n, baseRateBps: 1000, surchargeBps: 500 },
  { fromPence: 150_000_000n, toPence: null, baseRateBps: 1200, surchargeBps: 500 },
]

const NON_RESIDENTIAL_BANDS: Band[] = [
  { fromPence: 0n, toPence: 15_000_000n, baseRateBps: 0, surchargeBps: 0 },
  { fromPence: 15_000_000n, toPence: 25_000_000n, baseRateBps: 200, surchargeBps: 0 },
  { fromPence: 25_000_000n, toPence: null, baseRateBps: 500, surchargeBps: 0 },
]

export type SdltBandResult = {
  fromPence: bigint
  toPence: bigint | null
  ratePct: number
  taxPence: bigint
}

export type SdltResult = {
  totalPence: bigint
  effectiveRateBps: number
  breakdown: SdltBandResult[]
}

function computeFromBands(
  pricePence: bigint,
  bands: Band[],
  applySurcharge: boolean
): SdltResult {
  if (pricePence < 0n) throw new Error('Price cannot be negative')
  const breakdown: SdltBandResult[] = []
  let total = 0n

  for (const band of bands) {
    if (pricePence <= band.fromPence) break
    const ceiling = band.toPence === null ? pricePence : (pricePence < band.toPence ? pricePence : band.toPence)
    const taxableInBand = ceiling - band.fromPence
    const bps = band.baseRateBps + (applySurcharge ? band.surchargeBps : 0)
    const taxInBand = (taxableInBand * BigInt(bps)) / 10000n
    if (taxableInBand > 0n) {
      breakdown.push({
        fromPence: band.fromPence,
        toPence: band.toPence,
        ratePct: bps / 100,
        taxPence: taxInBand,
      })
      total += taxInBand
    }
  }

  const effectiveRateBps =
    pricePence === 0n ? 0 : Number((total * 10000n) / pricePence)
  return { totalPence: total, effectiveRateBps, breakdown }
}

export function sdltResidential(input: SdltInput): SdltResult {
  const applySurcharge =
    input.buyerKind === 'individual_additional' || input.buyerKind === 'company'
  return computeFromBands(input.pricePence, RESIDENTIAL_BANDS, applySurcharge)
}

export function sdltNonResidential(pricePence: bigint): SdltResult {
  return computeFromBands(pricePence, NON_RESIDENTIAL_BANDS, false)
}

export type SixPlusComparisonResult = {
  residential: SdltResult
  nonResidentialElection: SdltResult | null
  recommended: 'residential' | 'non_residential'
  savingPence: bigint
}

/**
 * For 6+ dwelling transactions, computes both residential and the
 * non-residential election, and recommends the cheaper option.
 * Returns nonResidentialElection: null if dwellingCount < 6.
 */
export function sdltSixPlusComparison(input: SdltInput): SixPlusComparisonResult {
  const residential = sdltResidential(input)
  if (input.dwellingCount < 6) {
    return {
      residential,
      nonResidentialElection: null,
      recommended: 'residential',
      savingPence: 0n,
    }
  }
  const nonResidential = sdltNonResidential(input.pricePence)
  const saving = residential.totalPence - nonResidential.totalPence
  return {
    residential,
    nonResidentialElection: nonResidential,
    recommended: saving > 0n ? 'non_residential' : 'residential',
    savingPence: saving > 0n ? saving : 0n,
  }
}
