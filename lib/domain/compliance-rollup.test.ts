import { describe, it, expect } from 'vitest'
import { complianceRollup, nextExpiringItem, attentionCount } from './compliance-rollup'

const NOW = new Date('2026-05-15')
const TODAY_ISO = '2026-05-15'

describe('complianceRollup', () => {
  it('returns zeros for an empty list', () => {
    expect(complianceRollup([], NOW)).toEqual({
      total: 0,
      valid: 0,
      expiring: 0,
      expired: 0,
      missing: 0,
      exempt: 0,
    })
  })

  it('classifies mixed states correctly', () => {
    const r = complianceRollup(
      [
        // Valid — far in the future
        { id: '1', kind: 'gas_safety', expiryDate: '2027-01-01' },
        // Expiring — within 60 days
        { id: '2', kind: 'eicr', expiryDate: '2026-06-15' },
        // Expired — past
        { id: '3', kind: 'epc', expiryDate: '2025-12-01' },
        // Missing — no expiry
        { id: '4', kind: 'pat', expiryDate: null },
        // Exempt — status wins over date
        { id: '5', kind: 'fire_alarm', expiryDate: '2025-01-01', status: 'exempt' },
      ],
      NOW,
    )
    expect(r.total).toBe(5)
    expect(r.valid).toBe(1)
    expect(r.expiring).toBe(1)
    expect(r.expired).toBe(1)
    expect(r.missing).toBe(1)
    expect(r.exempt).toBe(1)
  })
})

describe('nextExpiringItem', () => {
  it('returns null when nothing has an expiry', () => {
    expect(nextExpiringItem([{ id: '1', kind: 'pat', expiryDate: null }], NOW)).toBeNull()
  })

  it('picks the soonest expiring (or already expired) item', () => {
    const items = [
      { id: 'far', kind: 'gas_safety', expiryDate: '2027-01-01' },
      { id: 'soon', kind: 'eicr', expiryDate: '2026-06-15' },
      { id: 'overdue', kind: 'epc', expiryDate: '2025-12-01' },
    ]
    const picked = nextExpiringItem(items, NOW)
    expect(picked?.id).toBe('overdue')
  })

  it('skips exempt items', () => {
    const items = [
      { id: 'exempt-soon', kind: 'eicr', expiryDate: '2026-06-01', status: 'exempt' },
      { id: 'real-later', kind: 'gas_safety', expiryDate: '2026-11-01' },
    ]
    expect(nextExpiringItem(items, NOW)?.id).toBe('real-later')
  })
})

describe('attentionCount', () => {
  it('sums expiring + expired + missing', () => {
    expect(
      attentionCount(
        [
          { id: '1', kind: 'gas_safety', expiryDate: '2027-01-01' }, // valid
          { id: '2', kind: 'eicr', expiryDate: '2026-06-15' }, // expiring
          { id: '3', kind: 'epc', expiryDate: '2025-12-01' }, // expired
          { id: '4', kind: 'pat', expiryDate: null }, // missing
          { id: '5', kind: 'fire_alarm', expiryDate: TODAY_ISO, status: 'exempt' },
        ],
        NOW,
      ),
    ).toBe(3)
  })
})
