import { describe, it, expect } from 'vitest'
import {
  mandatoryLicenceRequired,
  hmoLicenceStatus,
  bedroomStatutoryCheck,
  lacorsKitchenStatus,
} from './hmo'

describe('mandatoryLicenceRequired (Housing Act 2004)', () => {
  it('5 occupants in ≥2 households → required', () => {
    expect(mandatoryLicenceRequired(5, 2)).toBe(true)
    expect(mandatoryLicenceRequired(6, 3)).toBe(true)
  })

  it('4 occupants → not required (sub-threshold)', () => {
    expect(mandatoryLicenceRequired(4, 2)).toBe(false)
  })

  it('5+ occupants but only 1 household → not required (single family)', () => {
    expect(mandatoryLicenceRequired(5, 1)).toBe(false)
  })
})

describe('hmoLicenceStatus', () => {
  const today = new Date('2026-06-01')

  it('not_required when sub-threshold and kind=none', () => {
    expect(
      hmoLicenceStatus(
        { hmoLicenceKind: 'none', hmoLicenceExpiry: null, occupants: 3, households: 2 },
        today,
      ),
    ).toBe('not_required')
  })

  it('missing_required when threshold hit but kind=none', () => {
    expect(
      hmoLicenceStatus(
        { hmoLicenceKind: 'none', hmoLicenceExpiry: null, occupants: 5, households: 2 },
        today,
      ),
    ).toBe('missing_required')
  })

  it('missing_required when licence kind set but expiry is null', () => {
    expect(
      hmoLicenceStatus(
        {
          hmoLicenceKind: 'mandatory',
          hmoLicenceExpiry: null,
          occupants: 5,
          households: 2,
        },
        today,
      ),
    ).toBe('missing_required')
  })

  it('expired when the expiry has passed', () => {
    expect(
      hmoLicenceStatus(
        {
          hmoLicenceKind: 'mandatory',
          hmoLicenceExpiry: '2026-05-15',
          occupants: 5,
          households: 2,
        },
        today,
      ),
    ).toBe('expired')
  })

  it('expiring within 60 days', () => {
    expect(
      hmoLicenceStatus(
        {
          hmoLicenceKind: 'mandatory',
          hmoLicenceExpiry: '2026-07-15',
          occupants: 5,
          households: 2,
        },
        today,
      ),
    ).toBe('expiring')
  })

  it('valid beyond the 60-day window', () => {
    expect(
      hmoLicenceStatus(
        {
          hmoLicenceKind: 'mandatory',
          hmoLicenceExpiry: '2027-06-01',
          occupants: 5,
          households: 2,
        },
        today,
      ),
    ).toBe('valid')
  })
})

describe('bedroomStatutoryCheck — Housing Act 2004 minimum room sizes', () => {
  it('6.51 sqm is the floor for a single adult', () => {
    const r = bedroomStatutoryCheck(6.51)
    expect(r.compliantOneAdult).toBe(true)
    expect(r.compliantTwoAdults).toBe(false)
  })

  it('a 6.5 sqm room fails the single-adult test by 0.01', () => {
    expect(bedroomStatutoryCheck(6.5).compliantOneAdult).toBe(false)
  })

  it('10.22 sqm permits a couple', () => {
    const r = bedroomStatutoryCheck(10.22)
    expect(r.compliantTwoAdults).toBe(true)
  })

  it('a child can sleep in a 4.64 sqm box room', () => {
    expect(bedroomStatutoryCheck(4.64).compliantOneChild).toBe(true)
    expect(bedroomStatutoryCheck(4.5).compliantOneChild).toBe(false)
  })
})

describe('lacorsKitchenStatus — LACORS guidance', () => {
  it('compliant at 5sqm for ≤4 sharers', () => {
    expect(lacorsKitchenStatus(5, 4)).toBe('compliant')
    expect(lacorsKitchenStatus(5, 2)).toBe('compliant')
  })

  it('borderline 4-5sqm for ≤4 sharers', () => {
    expect(lacorsKitchenStatus(4, 4)).toBe('borderline')
    expect(lacorsKitchenStatus(4.5, 3)).toBe('borderline')
  })

  it('undersized below 4sqm for ≤4 sharers', () => {
    expect(lacorsKitchenStatus(3.5, 3)).toBe('undersized')
  })

  it('5 sharers need at least 7sqm to be compliant', () => {
    expect(lacorsKitchenStatus(7, 5)).toBe('compliant')
    expect(lacorsKitchenStatus(6, 5)).toBe('borderline')
    expect(lacorsKitchenStatus(5, 5)).toBe('undersized')
  })

  it('6+ sharers need 9sqm to be compliant', () => {
    expect(lacorsKitchenStatus(9, 6)).toBe('compliant')
    expect(lacorsKitchenStatus(9, 8)).toBe('compliant')
    expect(lacorsKitchenStatus(7, 8)).toBe('borderline')
    expect(lacorsKitchenStatus(6, 6)).toBe('undersized')
  })
})
