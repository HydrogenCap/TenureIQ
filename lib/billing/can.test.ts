import { describe, it, expect } from 'vitest'
import { PLANS, getPlanLimits, nextPlanCovering, isPlanId } from './plans'

describe('plans', () => {
  it('every plan has a label', () => {
    for (const [id, p] of Object.entries(PLANS)) {
      expect(p.label, `plan ${id}`).toBeTruthy()
    }
  })

  it('feature gates ladder up monotonically', () => {
    // Once a feature is enabled on a plan, no higher plan disables it.
    let aasc = false
    let reports = false
    let investors = false
    for (const id of ['free', 'starter', 'growth', 'pro', 'enterprise'] as const) {
      const f = PLANS[id].features
      if (aasc) expect(f.aasc, `${id} regresses aasc`).toBe(true)
      if (reports) expect(f.reports, `${id} regresses reports`).toBe(true)
      if (investors) expect(f.investors, `${id} regresses investors`).toBe(true)
      aasc = aasc || f.aasc
      reports = reports || f.reports
      investors = investors || f.investors
    }
  })

  it('property limits ladder up (or null on enterprise)', () => {
    let prev = 0
    for (const id of ['free', 'starter', 'growth', 'pro'] as const) {
      const max = PLANS[id].maxProperties
      expect(max).not.toBeNull()
      expect(max!).toBeGreaterThanOrEqual(prev)
      prev = max!
    }
    expect(PLANS.enterprise.maxProperties).toBeNull()
  })

  it('getPlanLimits falls back to free for unknown plan ids', () => {
    expect(getPlanLimits('bogus').label).toBe('Free')
  })

  it('isPlanId narrows', () => {
    expect(isPlanId('free')).toBe(true)
    expect(isPlanId('xyz')).toBe(false)
  })
})

describe('nextPlanCovering', () => {
  it('returns first plan with aasc starting from free', () => {
    expect(nextPlanCovering((p) => p.features.aasc, 'free')).toBe('growth')
  })
  it('returns first plan with investors', () => {
    expect(nextPlanCovering((p) => p.features.investors, 'free')).toBe('pro')
  })
  it('does not regress — already on pro, asks for aasc → pro', () => {
    expect(nextPlanCovering((p) => p.features.aasc, 'pro')).toBe('pro')
  })
  it('returns null when no plan satisfies', () => {
    expect(nextPlanCovering((p) => p.maxProperties === 7)).toBeNull()
  })
  it('finds first plan whose maxProperties exceeds 4', () => {
    expect(
      nextPlanCovering((p) => p.maxProperties === null || p.maxProperties > 4),
    ).toBe('starter')
  })
})
