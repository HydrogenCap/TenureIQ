import { describe, it, expect } from 'vitest'
import { occupancyBps, voidDays, currentTenancy } from './occupancy'

describe('occupancyBps', () => {
  it('returns 0 for no units', () => {
    expect(occupancyBps([])).toBe(0)
  })
  it('returns 10000 (100%) for all occupied', () => {
    expect(occupancyBps([{ status: 'occupied' }, { status: 'occupied' }])).toBe(10_000)
  })
  it('mixes correctly', () => {
    // 1 of 4 occupied = 25% = 2500 bps
    expect(
      occupancyBps([
        { status: 'occupied' },
        { status: 'vacant' },
        { status: 'maintenance' },
        { status: 'vacant' },
      ]),
    ).toBe(2500)
  })
  it('does not count reserved as occupied', () => {
    expect(occupancyBps([{ status: 'reserved' }, { status: 'occupied' }])).toBe(5000)
  })
})

describe('voidDays', () => {
  it('returns 0 if either date missing', () => {
    expect(voidDays(null, '2026-01-01')).toBe(0)
    expect(voidDays('2026-01-01', null)).toBe(0)
  })
  it('counts calendar days between end and next start', () => {
    expect(voidDays('2026-01-01', '2026-01-15')).toBe(14)
  })
  it('returns 0 for overlapping (back-to-back same day)', () => {
    expect(voidDays('2026-01-15', '2026-01-15')).toBe(0)
  })
  it('returns 0 when next start is before end (data error)', () => {
    expect(voidDays('2026-01-15', '2026-01-01')).toBe(0)
  })
})

describe('currentTenancy', () => {
  const today = new Date('2026-05-15')

  it('returns null when no tenancies', () => {
    expect(currentTenancy([], today)).toBeNull()
  })

  it('returns the active tenancy when one is open-ended', () => {
    const t = currentTenancy(
      [{ id: 'a', status: 'active', startDate: '2026-01-01', endDate: null }],
      today,
    )
    expect(t?.id).toBe('a')
  })

  it('skips ended tenancies', () => {
    expect(
      currentTenancy(
        [{ id: 'a', status: 'ended', startDate: '2026-01-01', endDate: '2026-04-01' }],
        today,
      ),
    ).toBeNull()
  })

  it('skips soft-deleted', () => {
    expect(
      currentTenancy(
        [
          {
            id: 'a',
            status: 'active',
            startDate: '2026-01-01',
            endDate: null,
            deletedAt: '2026-03-01',
          },
        ],
        today,
      ),
    ).toBeNull()
  })

  it('skips not-yet-started', () => {
    expect(
      currentTenancy(
        [{ id: 'a', status: 'active', startDate: '2026-06-01', endDate: null }],
        today,
      ),
    ).toBeNull()
  })

  it('picks most-recently-started when overlapping', () => {
    const t = currentTenancy(
      [
        { id: 'old', status: 'active', startDate: '2025-01-01', endDate: null },
        { id: 'new', status: 'active', startDate: '2026-04-01', endDate: null },
      ],
      today,
    )
    expect(t?.id).toBe('new')
  })
})
