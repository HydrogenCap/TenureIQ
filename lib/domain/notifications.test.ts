import { describe, it, expect } from 'vitest'
import {
  mapReminderToNotification,
  hrefForRelated,
  relativeTime,
  type ReminderRow,
} from './notifications'

function row(overrides: Partial<ReminderRow>): ReminderRow {
  return {
    id: 'rem-1',
    related_kind: 'compliance',
    related_id: 'rec-1',
    body_key: 'compliance_reminder',
    context: {},
    trigger_at: '2026-07-01T08:00:00.000Z',
    status: 'sent',
    ...overrides,
  }
}

describe('mapReminderToNotification: compliance_reminder', () => {
  it('builds title from kind label + days and detail from property/expiry', () => {
    const item = mapReminderToNotification(
      row({
        context: {
          kind: 'gas_safety',
          days_until: 14,
          expiry_date: '2026-07-18',
          property_label: '12 High Street, Leeds',
          property_id: 'p1',
          issuer: null,
        },
      }),
    )
    expect(item.title).toBe('Gas safety certificate expires in 14 days')
    expect(item.detail).toBe('12 High Street, Leeds · due 2026-07-18')
    expect(item.href).toBe('/compliance/rec-1')
    expect(item.status).toBe('sent')
  })

  it('uses singular day, today and expired-ago phrasing', () => {
    expect(
      mapReminderToNotification(row({ context: { kind: 'eicr', days_until: 1 } })).title,
    ).toBe('EICR (electrical safety) expires in 1 day')
    expect(
      mapReminderToNotification(row({ context: { kind: 'epc', days_until: 0 } })).title,
    ).toBe('EPC expires today')
    expect(
      mapReminderToNotification(row({ context: { kind: 'hmo_licence', days_until: -3 } })).title,
    ).toBe('HMO licence expired 3 days ago')
  })

  it('humanises unknown compliance kinds and survives an empty context', () => {
    const unknownKind = mapReminderToNotification(
      row({ context: { kind: 'boiler_service', days_until: 7 } }),
    )
    expect(unknownKind.title).toBe('Boiler service expires in 7 days')

    // Enqueue-time rows have no property_label; a malformed context must
    // still render something clickable.
    const empty = mapReminderToNotification(row({ context: {} }))
    expect(empty.title).toBe('Compliance item expiry reminder')
    expect(empty.detail).toBeNull()
  })
})

describe('mapReminderToNotification: AASC reminders', () => {
  it('maps aasc_break_reminder with contractor + break date', () => {
    const item = mapReminderToNotification(
      row({
        related_kind: 'aasc_break',
        related_id: 'contract-9',
        body_key: 'aasc_break_reminder',
        context: {
          aasc_contract_id: 'contract-9',
          contractor: 'Serco',
          break_clause_date: '2026-08-01',
          days_until: 30,
        },
      }),
    )
    expect(item.title).toBe('Serco contract break clause in 30 days')
    expect(item.detail).toBe('break clause 2026-08-01')
    expect(item.href).toBe('/aasc/contracts/contract-9')
  })

  it('maps aasc_end_reminder including the today case', () => {
    const item = mapReminderToNotification(
      row({
        related_kind: 'aasc_end',
        related_id: 'contract-9',
        body_key: 'aasc_end_reminder',
        context: { contractor: 'Mears', end_date: '2026-07-04', days_until: 0 },
      }),
    )
    expect(item.title).toBe('Mears contract ends today')
    expect(item.detail).toBe('ends 2026-07-04')
    expect(item.href).toBe('/aasc/contracts/contract-9')
  })
})

describe('mapReminderToNotification: contractor_insurance_reminder', () => {
  it('maps expired contractor insurance', () => {
    const item = mapReminderToNotification(
      row({
        related_kind: 'contractor_insurance',
        related_id: 'contractor-3',
        body_key: 'contractor_insurance_reminder',
        context: {
          contractor_id: 'contractor-3',
          contractor_name: 'Ace Plumbing',
          insurance_expiry: '2026-06-30',
          days_until: -2,
        },
      }),
    )
    expect(item.title).toBe('Ace Plumbing insurance expired 2 days ago')
    expect(item.detail).toBe('due 2026-06-30')
    expect(item.href).toBe('/contractors/contractor-3')
  })
})

describe('mapReminderToNotification: unknown body_key fallback', () => {
  it('falls back to a humanised body_key and never throws', () => {
    const item = mapReminderToNotification(
      row({ body_key: 'lease_renewal_reminder', context: { anything: true } }),
    )
    expect(item.title).toBe('Lease renewal reminder')
    expect(item.detail).toBeNull()
  })

  it('treats non-sent statuses as pending', () => {
    expect(mapReminderToNotification(row({ status: 'pending' })).status).toBe('pending')
  })
})

describe('hrefForRelated', () => {
  it('routes each known related_kind and falls back to /dashboard', () => {
    expect(hrefForRelated('compliance', 'a')).toBe('/compliance/a')
    expect(hrefForRelated('mortgage', 'b')).toBe('/mortgages/b')
    expect(hrefForRelated('tenancy', 'c')).toBe('/tenancies/c')
    expect(hrefForRelated('aasc_break', 'd')).toBe('/aasc/contracts/d')
    expect(hrefForRelated('aasc_end', 'e')).toBe('/aasc/contracts/e')
    expect(hrefForRelated('contractor_insurance', 'f')).toBe('/contractors/f')
    expect(hrefForRelated('something_new', 'g')).toBe('/dashboard')
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-07-04T12:00:00.000Z')

  it('formats past and future days compactly', () => {
    expect(relativeTime('2026-07-01T12:00:00.000Z', now)).toBe('3d ago')
    expect(relativeTime('2026-07-06T12:00:00.000Z', now)).toBe('in 2d')
  })

  it('formats hours, minutes and the sub-minute case', () => {
    expect(relativeTime('2026-07-04T09:00:00.000Z', now)).toBe('3h ago')
    expect(relativeTime('2026-07-04T12:05:00.000Z', now)).toBe('in 5m')
    expect(relativeTime('2026-07-04T12:00:30.000Z', now)).toBe('now')
  })

  it('returns an empty string for unparseable input', () => {
    expect(relativeTime('not-a-date', now)).toBe('')
  })
})
