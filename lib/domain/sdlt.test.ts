import { describe, it, expect } from 'vitest'
import {
  sdltResidential,
  sdltNonResidential,
  sdltSixPlusComparison,
} from './sdlt'

describe('sdltResidential', () => {
  it('charges 0 on a £100k first-property purchase (under threshold)', () => {
    const r = sdltResidential({
      pricePence: 10_000_000n,
      dwellingCount: 1,
      buyerKind: 'individual_first_property',
    })
    expect(r.totalPence).toBe(0n)
  })

  it('charges correctly on a £300k purchase by individual additional', () => {
    // £125k @ 5% = £6,250
    // £125k @ 7% = £8,750
    // £50k @ 10% = £5,000
    // Total £20,000 = 2_000_000p
    const r = sdltResidential({
      pricePence: 30_000_000n,
      dwellingCount: 1,
      buyerKind: 'individual_additional',
    })
    expect(r.totalPence).toBe(2_000_000n)
  })

  it('applies company surcharge', () => {
    const r = sdltResidential({
      pricePence: 30_000_000n,
      dwellingCount: 1,
      buyerKind: 'company',
    })
    expect(r.totalPence).toBe(2_000_000n) // same as additional individual
  })

  it('handles £0 purchase (gift) cleanly', () => {
    const r = sdltResidential({
      pricePence: 0n,
      dwellingCount: 1,
      buyerKind: 'individual_first_property',
    })
    expect(r.totalPence).toBe(0n)
  })
})

describe('sdltNonResidential', () => {
  it('charges 0 on £100k', () => {
    expect(sdltNonResidential(10_000_000n).totalPence).toBe(0n)
  })

  it('charges correctly on a £1,795,000 commercial-equivalent', () => {
    // £150k @ 0% = £0
    // £100k @ 2% = £2,000
    // £1,545k @ 5% = £77,250
    // Total £79,250 = 7_925_000p
    expect(sdltNonResidential(179_500_000n).totalPence).toBe(7_925_000n)
  })
})

describe('sdltSixPlusComparison — the Clarence Court case', () => {
  it('shows large saving for a 19-flat block at £1,795k', () => {
    const result = sdltSixPlusComparison({
      pricePence: 179_500_000n,
      dwellingCount: 19,
      buyerKind: 'company',
    })
    expect(result.nonResidentialElection).not.toBeNull()
    expect(result.recommended).toBe('non_residential')
    // Saving > £100k
    expect(result.savingPence).toBeGreaterThan(10_000_000n)
  })

  it('returns null election for 5 dwellings (under threshold)', () => {
    const result = sdltSixPlusComparison({
      pricePence: 50_000_000n,
      dwellingCount: 5,
      buyerKind: 'company',
    })
    expect(result.nonResidentialElection).toBeNull()
    expect(result.recommended).toBe('residential')
  })

  it('still allows election for exactly 6 dwellings', () => {
    const result = sdltSixPlusComparison({
      pricePence: 60_000_000n,
      dwellingCount: 6,
      buyerKind: 'company',
    })
    expect(result.nonResidentialElection).not.toBeNull()
  })
})
