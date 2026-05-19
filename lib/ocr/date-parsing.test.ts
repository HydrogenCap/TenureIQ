import { describe, it, expect } from 'vitest'
import { parseUkDate, isoFromUkDate, addMonthsIso } from './date-parsing'

describe('parseUkDate — numeric forms', () => {
  it('parses DD/MM/YYYY', () => {
    expect(parseUkDate('15/04/2026')).toEqual({ day: 15, month: 4, year: 2026 })
  })

  it('parses DD-MM-YYYY', () => {
    expect(parseUkDate('15-04-2026')).toEqual({ day: 15, month: 4, year: 2026 })
  })

  it('parses DD.MM.YYYY', () => {
    expect(parseUkDate('15.04.2026')).toEqual({ day: 15, month: 4, year: 2026 })
  })

  it('parses DD MM YYYY with spaces', () => {
    expect(parseUkDate('15 04 2026')).toEqual({ day: 15, month: 4, year: 2026 })
  })

  it('accepts single-digit days and months', () => {
    expect(parseUkDate('5/4/2026')).toEqual({ day: 5, month: 4, year: 2026 })
  })

  it('returns null for clearly invalid strings', () => {
    expect(parseUkDate('not a date')).toBeNull()
    expect(parseUkDate('')).toBeNull()
    expect(parseUkDate('2026-04-15')).toBeNull() // YYYY-MM-DD is ISO, not UK
  })
})

describe('parseUkDate — worded forms', () => {
  it('parses "1 March 2026"', () => {
    expect(parseUkDate('1 March 2026')).toEqual({ day: 1, month: 3, year: 2026 })
  })

  it('parses "01 Mar 2026" (short month)', () => {
    expect(parseUkDate('01 Mar 2026')).toEqual({ day: 1, month: 3, year: 2026 })
  })

  it('is case-insensitive on the month', () => {
    expect(parseUkDate('1 MARCH 2026')).toEqual({ day: 1, month: 3, year: 2026 })
    expect(parseUkDate('1 march 2026')).toEqual({ day: 1, month: 3, year: 2026 })
  })

  it('accepts the "Sept" variant for September', () => {
    expect(parseUkDate('14 Sept 2025')).toEqual({ day: 14, month: 9, year: 2025 })
  })

  it('returns null for an unknown month name', () => {
    expect(parseUkDate('1 Smarch 2026')).toBeNull()
  })
})

describe('isoFromUkDate', () => {
  it('emits zero-padded YYYY-MM-DD', () => {
    expect(isoFromUkDate('1/3/2026')).toBe('2026-03-01')
    expect(isoFromUkDate('15/04/2026')).toBe('2026-04-15')
  })

  it('two-digit years 70-99 map to 19xx, 00-49 map to 20xx', () => {
    expect(isoFromUkDate('01/01/99')).toBe('1999-01-01')
    expect(isoFromUkDate('01/01/26')).toBe('2026-01-01')
    expect(isoFromUkDate('01/01/49')).toBe('2049-01-01')
    // 50 is the cutoff — 50-69 become 19xx in this impl.
    expect(isoFromUkDate('01/01/50')).toBe('1950-01-01')
  })

  it('rejects impossible months / days / years', () => {
    expect(isoFromUkDate('01/13/2026')).toBeNull() // month 13
    expect(isoFromUkDate('32/01/2026')).toBeNull() // day 32
    expect(isoFromUkDate('15/04/1800')).toBeNull() // pre-1900
    expect(isoFromUkDate('15/04/2200')).toBeNull() // post-2100
  })

  it('accepts Feb 29 (does not validate against the calendar)', () => {
    // This parser is permissive about Feb 29; the caller is responsible
    // for further calendar validation if needed.
    expect(isoFromUkDate('29/02/2024')).toBe('2024-02-29')
    // Note: it also accepts Feb 30 / Feb 31 — those are quarantined by
    // the schema layer downstream, not by this helper.
  })

  it('handles worded → ISO', () => {
    expect(isoFromUkDate('1 March 2026')).toBe('2026-03-01')
  })

  it('returns null for un-parseable input', () => {
    expect(isoFromUkDate('garbage')).toBeNull()
  })
})

describe('addMonthsIso', () => {
  it('adds 12 months to roll a year forward', () => {
    expect(addMonthsIso('2026-03-15', 12)).toBe('2027-03-15')
  })

  it('adds 6 months across the year boundary', () => {
    expect(addMonthsIso('2026-09-15', 6)).toBe('2027-03-15')
  })

  it('handles single-month increments', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-03-03') // Feb 31 → March 3
  })

  it('handles negative offsets (rewind)', () => {
    expect(addMonthsIso('2026-03-15', -1)).toBe('2026-02-15')
    expect(addMonthsIso('2026-01-15', -12)).toBe('2025-01-15')
  })

  it('returns null for a malformed input', () => {
    expect(addMonthsIso('not-a-date', 12)).toBeNull()
    expect(addMonthsIso('15/04/2026', 12)).toBeNull() // not ISO
  })

  it('preserves day across DST changes (uses UTC)', () => {
    // March 28th 2026 is a Sunday — UK DST begins. Adding 1 month
    // should not shift by an hour and accidentally roll the date.
    expect(addMonthsIso('2026-03-15', 1)).toBe('2026-04-15')
    expect(addMonthsIso('2026-10-15', 1)).toBe('2026-11-15')
  })

  it('handles the canonical "annual gas safety cert" case', () => {
    // Issue Apr 15 → next inspection Apr 14 is what most GSCs print,
    // but +12 months gives the calendar anniversary. The +/- 1 day
    // detail is for the extractor; this helper just adds months.
    expect(addMonthsIso('2026-04-15', 12)).toBe('2027-04-15')
  })
})
