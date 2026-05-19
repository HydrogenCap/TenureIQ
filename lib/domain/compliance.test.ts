import { describe, it, expect } from 'vitest'
import {
  complianceStatus,
  requiredComplianceKinds,
  RECOMMENDED_INTERVAL_MONTHS,
} from './compliance'

describe('complianceStatus', () => {
  const today = new Date('2026-06-01')

  it('returns "missing" for a null expiry', () => {
    expect(complianceStatus(null, today)).toBe('missing')
  })

  it('returns "expired" for a past expiry', () => {
    expect(complianceStatus('2026-05-31', today)).toBe('expired')
  })

  it('returns "expiring" within the default 60-day window', () => {
    expect(complianceStatus('2026-07-15', today)).toBe('expiring')
  })

  it('returns "valid" beyond the 60-day window', () => {
    expect(complianceStatus('2027-01-01', today)).toBe('valid')
  })

  it('respects a custom window for stricter early-warnings', () => {
    // 90-day window now classes 2026-08-15 as expiring.
    expect(complianceStatus('2026-08-15', today, 90)).toBe('expiring')
  })

  it('accepts a Date object', () => {
    expect(complianceStatus(new Date('2027-01-01'), today)).toBe('valid')
  })
})

describe('requiredComplianceKinds', () => {
  it('HMO without a licence kind needs the 6 core items but no licence row', () => {
    const kinds = requiredComplianceKinds('hmo', 'none')
    expect(kinds).toContain('gas_safety')
    expect(kinds).toContain('eicr')
    expect(kinds).toContain('epc')
    expect(kinds).toContain('fire_risk_assessment')
    expect(kinds).toContain('fire_alarm')
    expect(kinds).toContain('emergency_lighting')
    expect(kinds).not.toContain('hmo_licence')
  })

  it('HMO with mandatory licence adds the hmo_licence row', () => {
    expect(requiredComplianceKinds('hmo', 'mandatory')).toContain('hmo_licence')
  })

  it('HMO with additional licence also requires the hmo_licence row', () => {
    expect(requiredComplianceKinds('hmo', 'additional')).toContain('hmo_licence')
  })

  it('HMO with selective licence does NOT trigger the hmo_licence row', () => {
    // Selective licensing is a property-level scheme; the unit's
    // mandatory/additional flags drive the cert. Selective alone is
    // a separate compliance area.
    expect(requiredComplianceKinds('hmo', 'selective')).not.toContain('hmo_licence')
  })

  it('single_let needs the three core safety items', () => {
    expect(requiredComplianceKinds('single_let', 'none')).toEqual([
      'gas_safety',
      'eicr',
      'epc',
    ])
  })

  it('block focuses on communal safety, not the gas / EPC items', () => {
    expect(requiredComplianceKinds('block', 'none')).toEqual([
      'fire_risk_assessment',
      'fire_alarm',
      'emergency_lighting',
    ])
  })

  it('commercial: EICR + EPC + FRA, no gas safety', () => {
    expect(requiredComplianceKinds('commercial', 'none')).toEqual([
      'eicr',
      'epc',
      'fire_risk_assessment',
    ])
  })

  it('development / land require nothing structurally', () => {
    expect(requiredComplianceKinds('development', 'none')).toEqual([])
    expect(requiredComplianceKinds('land', 'none')).toEqual([])
  })
})

describe('RECOMMENDED_INTERVAL_MONTHS', () => {
  // Pins the canonical UK intervals. A typo would surface as
  // expired-before-due reminders.
  it('gas_safety annual', () => {
    expect(RECOMMENDED_INTERVAL_MONTHS.gas_safety).toBe(12)
  })

  it('eicr 5-yearly', () => {
    expect(RECOMMENDED_INTERVAL_MONTHS.eicr).toBe(60)
  })

  it('epc 10-yearly', () => {
    expect(RECOMMENDED_INTERVAL_MONTHS.epc).toBe(120)
  })

  it('hmo_licence 5-yearly', () => {
    expect(RECOMMENDED_INTERVAL_MONTHS.hmo_licence).toBe(60)
  })
})
