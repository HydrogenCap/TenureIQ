import { describe, it, expect } from 'vitest'
import { isLetBlocked, meesStatus } from './mees'

describe('isLetBlocked', () => {
  it('blocks F and G against the default minimum E', () => {
    expect(isLetBlocked('F')).toBe(true)
    expect(isLetBlocked('G')).toBe(true)
  })

  it('allows A-E against the default minimum E', () => {
    expect(isLetBlocked('A')).toBe(false)
    expect(isLetBlocked('B')).toBe(false)
    expect(isLetBlocked('C')).toBe(false)
    expect(isLetBlocked('D')).toBe(false)
    expect(isLetBlocked('E')).toBe(false)
  })

  it('respects a custom minimum (e.g. the 2028 proposed C floor)', () => {
    expect(isLetBlocked('D', 'C')).toBe(true)
    expect(isLetBlocked('C', 'C')).toBe(false)
  })
})

describe('meesStatus', () => {
  const today = new Date('2026-06-01')

  it('returns epc_missing when band is null', () => {
    expect(meesStatus(null, '2030-01-01', 'E', today)).toBe('epc_missing')
  })

  it('returns epc_missing when expiry is null', () => {
    expect(meesStatus('C', null, 'E', today)).toBe('epc_missing')
  })

  it('returns epc_expired when the EPC has expired', () => {
    expect(meesStatus('C', '2025-12-31', 'E', today)).toBe('epc_expired')
  })

  it('returns let_blocked for F / G even within an active EPC', () => {
    expect(meesStatus('F', '2030-01-01', 'E', today)).toBe('let_blocked')
    expect(meesStatus('G', '2030-01-01', 'E', today)).toBe('let_blocked')
  })

  it('expired-AND-let-blocked returns expired first (renewal priority)', () => {
    // F band with expired EPC: we want the operator to renew, which
    // might give them a better rating. Expired prevents action either
    // way; surface that first.
    expect(meesStatus('F', '2024-01-01', 'E', today)).toBe('epc_expired')
  })

  it('returns compliant for A-E with a current EPC', () => {
    for (const b of ['A', 'B', 'C', 'D', 'E'] as const) {
      expect(meesStatus(b, '2030-01-01', 'E', today)).toBe('compliant')
    }
  })

  it('accepts a Date object for expiry', () => {
    expect(meesStatus('C', new Date('2030-01-01'), 'E', today)).toBe('compliant')
  })

  it('honours a stricter minimum band for forward-looking checks', () => {
    // 2028 PRS proposal: minimum C.
    expect(meesStatus('D', '2030-01-01', 'C', today)).toBe('let_blocked')
    expect(meesStatus('C', '2030-01-01', 'C', today)).toBe('compliant')
  })
})
