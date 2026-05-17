import { describe, it, expect } from 'vitest'
import { parseUkDate, isoFromUkDate, addMonthsIso } from '../date-parsing'
import { extractGasSafety } from './gas-safety'
import { extractEicr } from './eicr'
import { extractEpc } from './epc'
import { extractByKind } from './index'

describe('parseUkDate', () => {
  it('DD/MM/YYYY', () => {
    expect(parseUkDate('01/03/2024')).toEqual({ day: 1, month: 3, year: 2024 })
  })
  it('DD-MM-YYYY', () => {
    expect(parseUkDate('15-12-2024')).toEqual({ day: 15, month: 12, year: 2024 })
  })
  it('1 March 2024', () => {
    expect(parseUkDate('1 March 2024')).toEqual({ day: 1, month: 3, year: 2024 })
  })
  it('1 Mar 24', () => {
    expect(parseUkDate('1 Mar 24')).toEqual({ day: 1, month: 3, year: 24 })
  })
  it('rejects garbage', () => {
    expect(parseUkDate('not a date')).toBeNull()
  })
})

describe('isoFromUkDate', () => {
  it('two-digit years roll up to 2000s', () => {
    expect(isoFromUkDate('01/03/24')).toBe('2024-03-01')
  })
  it('worded with short year', () => {
    expect(isoFromUkDate('1 Mar 24')).toBe('2024-03-01')
  })
  it('rejects out-of-range months', () => {
    expect(isoFromUkDate('01/13/2024')).toBeNull()
  })
})

describe('addMonthsIso', () => {
  it('+12 months', () => {
    expect(addMonthsIso('2024-03-15', 12)).toBe('2025-03-15')
  })
  it('+60 (EICR cycle)', () => {
    expect(addMonthsIso('2024-03-15', 60)).toBe('2029-03-15')
  })
  it('+120 (EPC cycle)', () => {
    expect(addMonthsIso('2024-03-15', 120)).toBe('2034-03-15')
  })
})

describe('extractGasSafety', () => {
  it('clean cert text', () => {
    const text = `
      Landlord Gas Safety Record CP12
      Property: 12 Holmer Road, Hereford HR4 9TZ
      Inspection date: 15/03/2024
      Next inspection: 14/03/2025
      Engineer: John Smith
      Company: ABC Gas Ltd
    `
    const r = extractGasSafety(text)
    expect(r.extracted.issueDate).toBe('2024-03-15')
    expect(r.extracted.expiryDate).toBe('2025-03-14')
    expect(r.extracted.issuer).toContain('ABC Gas')
    expect(r.fieldConfidenceBps).toBeGreaterThan(8000)
    expect(r.extracted.raw['derived_expiry']).toBe('false')
  })
  it('derives expiry when only issue date', () => {
    const text = `
      Inspection date: 01/01/2024
      Engineer: Jane Doe
    `
    const r = extractGasSafety(text)
    expect(r.extracted.issueDate).toBe('2024-01-01')
    expect(r.extracted.expiryDate).toBe('2025-01-01')
    expect(r.extracted.raw['derived_expiry']).toBe('true')
  })
  it('returns nulls on garbage', () => {
    const r = extractGasSafety('total nonsense here')
    expect(r.extracted.issueDate).toBeNull()
    expect(r.extracted.expiryDate).toBeNull()
    expect(r.fieldConfidenceBps).toBeLessThan(3000)
  })
})

describe('extractEicr', () => {
  it('5-year cycle', () => {
    const text = `
      Electrical Installation Condition Report
      Date of inspection: 10/02/2024
      Recommended next test period: 5 years
      Contractor: Sparkies UK Ltd
      NICEIC No: 12345-AB
    `
    const r = extractEicr(text)
    expect(r.extracted.issueDate).toBe('2024-02-10')
    expect(r.extracted.expiryDate).toBe('2029-02-10') // derived
    expect(r.extracted.raw['accreditation']).toContain('NICEIC 12345-AB')
  })
})

describe('extractEpc', () => {
  it('10-year derivation', () => {
    const text = `
      Energy Performance Certificate
      Date of assessment: 05/06/2024
      Current Energy Efficiency Rating: C
      Assessor name: Bob Johnson
    `
    const r = extractEpc(text)
    expect(r.extracted.issueDate).toBe('2024-06-05')
    expect(r.extracted.expiryDate).toBe('2034-06-05')
    expect(r.extracted.raw['rating']).toBe('C')
  })
})

describe('extractByKind dispatcher', () => {
  it('routes gas_safety to its extractor', () => {
    const r = extractByKind('gas_safety', 'Inspection date: 15/03/2024')
    expect(r.extracted.issueDate).toBe('2024-03-15')
  })
  it('falls back to generic for unknown kinds', () => {
    const r = extractByKind('legionella', 'Inspection date: 01/01/2024')
    expect(r.extracted.issueDate).toBe('2024-01-01')
  })
})
