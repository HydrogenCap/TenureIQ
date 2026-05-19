import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { validateRows } from './validate'

const ItemSchema = z.object({
  name: z.string().min(1, 'name required'),
  amountPence: z.bigint().nonnegative('amount must be ≥ 0'),
  kind: z.enum(['rent', 'fee']),
})

type Item = z.infer<typeof ItemSchema>

function mapRow(raw: Record<string, string>): Record<string, unknown> {
  return {
    name: raw.name ?? '',
    amountPence: raw.amount_pence ? BigInt(raw.amount_pence) : null,
    kind: raw.kind ?? '',
  }
}

describe('validateRows', () => {
  it('returns all rows as valid when every row passes the schema', () => {
    const rows = [
      { name: 'A', amount_pence: '100', kind: 'rent' },
      { name: 'B', amount_pence: '200', kind: 'fee' },
    ]
    const result = validateRows<Item>(rows, ItemSchema, mapRow)
    expect(result.valid).toHaveLength(2)
    expect(result.invalid).toHaveLength(0)
    expect(result.valid[0]!.amountPence).toBe(100n)
  })

  it('quarantines invalid rows with row index + field path', () => {
    const rows = [
      { name: 'A', amount_pence: '100', kind: 'rent' },
      { name: '', amount_pence: '200', kind: 'fee' }, // empty name
      { name: 'C', amount_pence: '-50', kind: 'rent' }, // negative
    ]
    const result = validateRows<Item>(rows, ItemSchema, mapRow)
    expect(result.valid).toHaveLength(1)
    expect(result.invalid).toHaveLength(2)
    expect(result.invalid[0]!.rowIndex).toBe(1)
    expect(result.invalid[0]!.errors[0]!.field).toBe('name')
    expect(result.invalid[1]!.rowIndex).toBe(2)
    expect(result.invalid[1]!.errors[0]!.field).toBe('amountPence')
  })

  it('preserves the raw row alongside the errors for re-render', () => {
    const rows = [{ name: 'X', amount_pence: '10', kind: 'unknown' }]
    const result = validateRows<Item>(rows, ItemSchema, mapRow)
    expect(result.invalid[0]!.raw).toEqual(rows[0])
  })

  it('reports multiple errors on the same row when the schema has multiple violations', () => {
    const rows = [{ name: '', amount_pence: '-1', kind: 'bogus' }]
    const result = validateRows<Item>(rows, ItemSchema, mapRow)
    expect(result.invalid).toHaveLength(1)
    const fields = result.invalid[0]!.errors.map((e) => e.field)
    expect(fields).toContain('name')
    expect(fields).toContain('amountPence')
    expect(fields).toContain('kind')
  })

  it('handles an empty input array', () => {
    const result = validateRows<Item>([], ItemSchema, mapRow)
    expect(result.valid).toEqual([])
    expect(result.invalid).toEqual([])
  })
})
