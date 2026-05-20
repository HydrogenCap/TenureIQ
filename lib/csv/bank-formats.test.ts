import { describe, it, expect } from 'vitest'
import { detectBankFormat, mapBankRow } from './bank-formats'

describe('detectBankFormat', () => {
  it('detects Monzo by its signature columns', () => {
    const headers = ['Transaction ID', 'Date', 'Amount', 'Notes and #tags', 'Name']
    expect(detectBankFormat(headers).id).toBe('monzo')
  })

  it('detects Starling', () => {
    const headers = ['Date', 'Counter Party', 'Reference', 'Type', 'Amount (GBP)', 'Balance (GBP)']
    expect(detectBankFormat(headers).id).toBe('starling')
  })

  it('detects HSBC', () => {
    const headers = ['Date', 'Type', 'Description', 'Paid out', 'Paid in', 'Balance']
    expect(detectBankFormat(headers).id).toBe('hsbc')
  })

  it('falls back to generic for unknown shapes', () => {
    const headers = ['Date', 'Description', 'Amount']
    expect(detectBankFormat(headers).id).toBe('generic')
  })

  it('is case-insensitive', () => {
    const headers = ['DATE', 'COUNTER PARTY', 'AMOUNT (GBP)', 'BALANCE (GBP)']
    expect(detectBankFormat(headers).id).toBe('starling')
  })
})

describe('mapBankRow — Monzo', () => {
  it('parses a credit', () => {
    const row = mapBankRow('monzo', {
      'Transaction ID': 'tx_abc',
      Date: '01/05/2026',
      Amount: '150.00',
      'Notes and #tags': '',
      Description: 'Rent received',
    })
    expect(row).not.toBeNull()
    expect(row!.amountPence).toBe(15_000n)
    expect(row!.externalId).toBe('tx_abc')
    expect(row!.postedAt).toBe('2026-05-01')
  })

  it('parses a debit (negative amount)', () => {
    const row = mapBankRow('monzo', {
      'Transaction ID': 'tx_def',
      Date: '01/05/2026',
      Amount: '-85.50',
      'Notes and #tags': '',
      Description: 'Boiler service',
    })
    expect(row).not.toBeNull()
    expect(row!.amountPence).toBe(-8_550n)
  })
})

describe('mapBankRow — Starling', () => {
  it('parses with counter party as description', () => {
    const row = mapBankRow('starling', {
      Date: '15/04/2026',
      'Counter Party': 'TENANT JOHN SMITH',
      Reference: 'May rent',
      Type: 'Faster Payment',
      'Amount (GBP)': '1200',
      'Balance (GBP)': '3450.00',
    })
    expect(row).not.toBeNull()
    expect(row!.amountPence).toBe(120_000n)
    expect(row!.description).toBe('TENANT JOHN SMITH')
    expect(row!.reference).toBe('May rent')
    expect(row!.externalId).toBeNull()
  })
})

describe('mapBankRow — HSBC', () => {
  it('treats "Paid out" as negative', () => {
    const row = mapBankRow('hsbc', {
      Date: '20/04/2026',
      Type: 'DD',
      Description: 'BRITISH GAS DIRECT DEBIT',
      'Paid out': '125.50',
      'Paid in': '',
      Balance: '3,200.00',
    })
    expect(row).not.toBeNull()
    expect(row!.amountPence).toBe(-12_550n)
  })

  it('treats "Paid in" as positive', () => {
    const row = mapBankRow('hsbc', {
      Date: '01/04/2026',
      Type: 'FPI',
      Description: 'CLEARSPRINGS WEEKLY',
      'Paid out': '',
      'Paid in': '£2,800.00',
      Balance: '5,000.00',
    })
    expect(row).not.toBeNull()
    expect(row!.amountPence).toBe(280_000n)
  })

  it('skips rolling-balance rows (both columns empty)', () => {
    const row = mapBankRow('hsbc', {
      Date: '01/04/2026',
      Type: '',
      Description: 'Opening balance',
      'Paid out': '',
      'Paid in': '',
      Balance: '5000',
    })
    expect(row).toBeNull()
  })
})

describe('mapBankRow — generic', () => {
  it('accepts amount_gbp (pounds with decimals) as the canonical pounds field', () => {
    const row = mapBankRow('generic', {
      posted_at: '2026-05-01',
      description: 'Test',
      amount_gbp: '99.99',
    })
    expect(row).not.toBeNull()
    expect(row!.amountPence).toBe(9999n)
    expect(row!.postedAt).toBe('2026-05-01')
  })

  it('accepts amount_pence as integer pence (no decimals, no multiplication)', () => {
    const row = mapBankRow('generic', {
      posted_at: '2026-05-01',
      description: 'Test',
      amount_pence: '9999',
    })
    expect(row).not.toBeNull()
    expect(row!.amountPence).toBe(9999n)
  })

  it('rejects a decimal in amount_pence — caller must pick the right column', () => {
    const row = mapBankRow('generic', {
      posted_at: '2026-05-01',
      description: 'Test',
      amount_pence: '99.99',
    })
    expect(row).toBeNull()
  })

  it('falls back to bare "amount" / "Amount" if neither canonical column is present', () => {
    const row = mapBankRow('generic', {
      posted_at: '2026-05-01',
      description: 'Test',
      Amount: '1234.56',
    })
    expect(row).not.toBeNull()
    expect(row!.amountPence).toBe(123_456n)
  })
})

describe('moneyToPence — float-safety', () => {
  // These cases exercise the string-based parser. The earlier
  // Number(...) * 100 path occasionally drifted by a pence on values
  // that don't survive a float round-trip.
  it('parses 0.10 as exactly 10p (not 9 / 11)', () => {
    const row = mapBankRow('generic', {
      posted_at: '2026-05-01',
      description: 'tip',
      amount_gbp: '0.10',
    })
    expect(row!.amountPence).toBe(10n)
  })

  it('parses negative pence', () => {
    const row = mapBankRow('generic', {
      posted_at: '2026-05-01',
      description: 'fee',
      amount_gbp: '-0.30',
    })
    expect(row!.amountPence).toBe(-30n)
  })

  it('strips £ and thousands separators', () => {
    const row = mapBankRow('generic', {
      posted_at: '2026-05-01',
      description: 'rent',
      amount_gbp: '£1,234.56',
    })
    expect(row!.amountPence).toBe(123_456n)
  })

  it('truncates beyond two fractional digits rather than rounding', () => {
    const row = mapBankRow('generic', {
      posted_at: '2026-05-01',
      description: 'weird CSV',
      amount_gbp: '1.999',
    })
    expect(row!.amountPence).toBe(199n)
  })
})
