// End-to-end fixture tests: real-world-shaped CSV string → papaparse →
// detectBankFormat → mapBankRow. Catches the bugs the bank-formats unit
// tests miss because they pass synthetic row objects rather than CSV
// bytes (quoting, embedded commas, BOM, header drift, blank rows).

import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { detectBankFormat, mapBankRow, type CanonicalRow } from './bank-formats'

function parseAndMap(csv: string): { format: string; rows: CanonicalRow[] } {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })
  const fmt = detectBankFormat(parsed.meta.fields ?? [])
  const rows: CanonicalRow[] = []
  for (const raw of parsed.data) {
    const r = mapBankRow(fmt.id, raw)
    if (r) rows.push(r)
  }
  return { format: fmt.id, rows }
}

describe('Monzo CSV fixture', () => {
  // Trimmed real Monzo export header + 3 rows.
  const csv = `Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split
tx_0000AbCdEf01,15/04/2026,09:32:11,Faster payment,TENANT ALICE,,Income,1200.00,GBP,1200.00,GBP,May rent,,, ,
tx_0000AbCdEf02,15/04/2026,12:01:50,Card payment,BRITISH GAS,⚡,Bills,-85.50,GBP,-85.50,GBP,Boiler service,123 High St,,,
tx_0000AbCdEf03,16/04/2026,07:15:00,Faster payment,COUNCIL,,Bills,-150.45,GBP,-150.45,GBP,Council tax,,,,`

  it('detects as monzo + parses 3 rows', () => {
    const { format, rows } = parseAndMap(csv)
    expect(format).toBe('monzo')
    expect(rows).toHaveLength(3)
  })

  it('keeps signs (credit positive, debits negative)', () => {
    const { rows } = parseAndMap(csv)
    expect(rows[0]!.amountPence).toBe(120_000n)
    expect(rows[1]!.amountPence).toBe(-8_550n)
    expect(rows[2]!.amountPence).toBe(-15_045n)
  })

  it('captures the Monzo transaction id for dedup', () => {
    const { rows } = parseAndMap(csv)
    expect(rows[0]!.externalId).toBe('tx_0000AbCdEf01')
    expect(rows[2]!.externalId).toBe('tx_0000AbCdEf03')
  })
})

describe('Starling CSV fixture', () => {
  const csv = `Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category,Notes
15/04/2026,"SMITH, JOHN",May rent,Faster Payment,1200,4650.00,Income,
16/04/2026,BRITISH GAS,,Direct Debit,-95.00,4555.00,Bills,Gas DD
17/04/2026,STRIPE TRANSFER,,Stripe Payout,2475.50,7030.50,Income,`

  it('detects starling + parses 3 rows', () => {
    const { format, rows } = parseAndMap(csv)
    expect(format).toBe('starling')
    expect(rows).toHaveLength(3)
  })

  it('handles a counter-party value with an embedded comma', () => {
    const { rows } = parseAndMap(csv)
    expect(rows[0]!.description).toBe('SMITH, JOHN')
  })

  it('uses reference as fallback description when counter party is blank', () => {
    // Real-world Starling export occasionally has blank counter party.
    const csvBlank = `Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP)
01/04/2026,,Setup fee,Fee,-10.00,1000.00`
    const { rows } = parseAndMap(csvBlank)
    expect(rows[0]!.description).toBe('Setup fee')
  })
})

describe('HSBC CSV fixture', () => {
  // HSBC Business Internet Banking format with currency-prefixed
  // amounts and the rolling-balance opening row.
  const csv = `Date,Type,Description,Paid out,Paid in,Balance
01/04/2026,,Opening balance,,,"5,000.00"
05/04/2026,DD,BRITISH GAS DIRECT DEBIT,125.50,,"4,874.50"
07/04/2026,FPI,CLEARSPRINGS WEEKLY,,"£2,800.00","7,674.50"
12/04/2026,SO,STANDING ORDER MORTGAGE,950.00,,"6,724.50"`

  it('detects hsbc + skips the rolling-balance opening row', () => {
    const { format, rows } = parseAndMap(csv)
    expect(format).toBe('hsbc')
    // Opening balance row has both Paid in / Paid out blank → skipped.
    expect(rows).toHaveLength(3)
  })

  it('treats Paid out as negative and Paid in as positive', () => {
    const { rows } = parseAndMap(csv)
    expect(rows[0]!.amountPence).toBe(-12_550n) // DD
    expect(rows[1]!.amountPence).toBe(280_000n) // FPI with £ prefix
    expect(rows[2]!.amountPence).toBe(-95_000n) // SO
  })
})

describe('Generic CSV fixture', () => {
  const csv = `posted_at,description,amount_pence,reference
2026-05-01,Rent received,1200.00,May rent
2026-05-02,Insurance,-45.99,Annual premium`

  it('parses both rows with correct signs', () => {
    const { format, rows } = parseAndMap(csv)
    expect(format).toBe('generic')
    expect(rows[0]!.amountPence).toBe(120_000n)
    expect(rows[1]!.amountPence).toBe(-4_599n)
  })
})

describe('Edge cases', () => {
  it('handles a UTF-8 BOM at the start of the file', () => {
    const csv = '﻿Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP)\n01/04/2026,TEST,,FP,100,200'
    const { format, rows } = parseAndMap(csv)
    expect(format).toBe('starling')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.amountPence).toBe(10_000n)
  })

  it('treats CRLF line endings the same as LF', () => {
    const csv =
      'Transaction ID,Date,Amount,Notes and #tags,Name\r\n' +
      'tx_a,01/05/2026,1.00,,Test\r\n'
    const { format, rows } = parseAndMap(csv)
    expect(format).toBe('monzo')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.amountPence).toBe(100n)
  })
})
