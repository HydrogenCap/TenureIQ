import { describe, it, expect } from 'vitest'
import { isLetBlocked, meesStatus } from './mees'
import {
  mandatoryLicenceRequired,
  hmoLicenceStatus,
  bedroomStatutoryCheck,
  lacorsKitchenStatus,
} from './hmo'
import {
  individualLandlordTax,
  companyLandlordTax,
  section24CostPence,
} from './section24'
import {
  clearspringsMaxWeeklyPence,
  clearspringsMaxMonthlyPence,
  sercoAreaStatus,
  clearspringsDemandGap,
} from './aasc'

describe('MEES', () => {
  it('blocks F and G with default minimum E', () => {
    expect(isLetBlocked('F')).toBe(true)
    expect(isLetBlocked('G')).toBe(true)
    expect(isLetBlocked('E')).toBe(false)
    expect(isLetBlocked('A')).toBe(false)
  })

  it('honours raised C minimum (forward config)', () => {
    expect(isLetBlocked('D', 'C')).toBe(true)
    expect(isLetBlocked('C', 'C')).toBe(false)
  })

  it('returns let_blocked for F with valid future expiry', () => {
    expect(meesStatus('F', '2030-01-01', 'E', new Date('2026-01-01'))).toBe('let_blocked')
  })

  it('returns epc_expired when expiry has passed', () => {
    expect(meesStatus('C', '2020-01-01', 'E', new Date('2026-01-01'))).toBe('epc_expired')
  })

  it('returns epc_missing when band or expiry absent', () => {
    expect(meesStatus(null, '2030-01-01')).toBe('epc_missing')
    expect(meesStatus('C', null)).toBe('epc_missing')
  })
})

describe('HMO', () => {
  it('requires mandatory licence at 5+ persons in 2+ households', () => {
    expect(mandatoryLicenceRequired(5, 2)).toBe(true)
    expect(mandatoryLicenceRequired(4, 2)).toBe(false)
    expect(mandatoryLicenceRequired(6, 1)).toBe(false) // single household
  })

  it('flags missing_required when occupants exceed threshold but no licence', () => {
    expect(
      hmoLicenceStatus({
        hmoLicenceKind: 'none',
        hmoLicenceExpiry: null,
        occupants: 6,
        households: 6,
      })
    ).toBe('missing_required')
  })

  it('returns expiring within 60 days', () => {
    const today = new Date('2026-05-01')
    const inThirty = new Date('2026-05-31').toISOString()
    expect(
      hmoLicenceStatus(
        {
          hmoLicenceKind: 'mandatory',
          hmoLicenceExpiry: inThirty,
          occupants: 6,
          households: 6,
        },
        today
      )
    ).toBe('expiring')
  })

  it('bedroom statutory minimums', () => {
    const r = bedroomStatutoryCheck(7.0)
    expect(r.compliantOneAdult).toBe(true)
    expect(r.compliantTwoAdults).toBe(false)
  })

  it('LACORS kitchen sizing — 5-occupant HMO', () => {
    expect(lacorsKitchenStatus(7.0, 5)).toBe('compliant')
    expect(lacorsKitchenStatus(6.5, 5)).toBe('borderline')
    expect(lacorsKitchenStatus(5.0, 5)).toBe('undersized')
  })
})

describe('Section 24', () => {
  it('higher-rate landlord pays substantially more under S24', () => {
    // £20k rent, £8k interest, £3k other, 40% marginal
    const result = individualLandlordTax({
      grossRentPence: 2_000_000n,
      mortgageInterestPence: 800_000n,
      otherCostsPence: 300_000n,
      marginalRateBps: 4000,
    })
    // Taxable profit (interest NOT deducted): £17,000 → tax before credit £6,800
    // Credit: 20% of £8,000 = £1,600. Net tax £5,200 = 520_000p
    expect(result.netTaxPence).toBe(520_000n)
  })

  it('basic-rate landlord unaffected by S24', () => {
    const cost = section24CostPence({
      grossRentPence: 2_000_000n,
      mortgageInterestPence: 800_000n,
      otherCostsPence: 300_000n,
      marginalRateBps: 2000,
    })
    expect(cost).toBe(0n)
  })

  it('company pays CT on profit after interest deduction', () => {
    const result = companyLandlordTax({
      grossRentPence: 2_000_000n,
      mortgageInterestPence: 800_000n,
      otherCostsPence: 300_000n,
      ctRateBps: 2500,
    })
    // Profit £9,000, tax £2,250 = 225_000p
    expect(result.netTaxPence).toBe(225_000n)
  })

  it('section24CostPence quantifies the higher-rate hit', () => {
    const cost = section24CostPence({
      grossRentPence: 2_000_000n,
      mortgageInterestPence: 800_000n,
      otherCostsPence: 300_000n,
      marginalRateBps: 4000,
    })
    // Pre-S24: profit £9,000, tax £3,600. Post-S24: £5,200. Delta = £1,600
    expect(cost).toBe(160_000n)
  })
})

describe('AASC', () => {
  it('Clearsprings ceiling = SAR * 1.40', () => {
    // SAR £95/wk → 9500p → max = 9500 * 1.4 = 13_300p
    expect(clearspringsMaxWeeklyPence(9500n)).toBe(13300n)
  })

  it('Clearsprings monthly conversion uses weekly * 52 / 12', () => {
    // max weekly 13_300p → monthly = 13_300 * 52 / 12 = 57_633p
    expect(clearspringsMaxMonthlyPence(9500n)).toBe(57_633n)
  })

  it('serco area lookup', () => {
    const areas = [
      { localAuthority: 'Herefordshire', status: 'open' as const },
      { localAuthority: 'Liverpool', status: 'closed' as const },
    ]
    expect(sercoAreaStatus(areas, 'Herefordshire')).toBe('open')
    expect(sercoAreaStatus(areas, 'liverpool')).toBe('closed') // case-insensitive
    expect(sercoAreaStatus(areas, 'Unknown')).toBe('unknown')
  })

  it('clearsprings demand gap lookup', () => {
    const gaps = [
      { localAuthority: 'Cheltenham', demandPending: 223 },
      { localAuthority: 'Portsmouth', demandPending: -206 },
    ]
    expect(clearspringsDemandGap(gaps, 'Cheltenham')).toBe(223)
    expect(clearspringsDemandGap(gaps, 'Portsmouth')).toBe(-206)
    expect(clearspringsDemandGap(gaps, 'Unknown')).toBeNull()
  })
})
