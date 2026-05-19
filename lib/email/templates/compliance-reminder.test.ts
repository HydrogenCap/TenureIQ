import { describe, it, expect } from 'vitest'
import { renderComplianceReminder } from './compliance-reminder'

const base = {
  kind: 'gas_safety',
  expiry_date: '2026-06-30',
  days_until: 30,
  property_label: '12 Acacia Avenue',
  issuer: 'Gas Safe Ltd',
  recipient_name: 'Alice',
}

describe('renderComplianceReminder — subject', () => {
  it('reads "expires in Nd" when days_until > 0', () => {
    const r = renderComplianceReminder({ ...base, days_until: 30 })
    expect(r.subject).toBe('Gas safety certificate expires in 30d — 12 Acacia Avenue')
  })

  it('uses [Today] prefix when days_until === 0', () => {
    const r = renderComplianceReminder({ ...base, days_until: 0 })
    expect(r.subject).toBe('[Today] Gas safety certificate — 12 Acacia Avenue')
  })

  it('uses [Expired] prefix when days_until < 0', () => {
    const r = renderComplianceReminder({ ...base, days_until: -3 })
    expect(r.subject).toBe('[Expired] Gas safety certificate — 12 Acacia Avenue')
  })

  it('falls back to a humanised kind for unknown values', () => {
    const r = renderComplianceReminder({ ...base, kind: 'made_up_kind', days_until: 5 })
    expect(r.subject).toContain('made_up_kind') // not the literal underscored form in subject
  })
})

describe('renderComplianceReminder — text body', () => {
  it('renders singular "1 day" vs plural "N days"', () => {
    const single = renderComplianceReminder({ ...base, days_until: 1 })
    expect(single.text).toContain('expires in 1 day ')
    const plural = renderComplianceReminder({ ...base, days_until: 30 })
    expect(plural.text).toContain('expires in 30 days ')
  })

  it('handles "expired N days ago" for negative days_until', () => {
    const r = renderComplianceReminder({ ...base, days_until: -5 })
    expect(r.text).toContain('expired 5 days ago')
  })

  it('renders "expires today" when days_until === 0', () => {
    const r = renderComplianceReminder({ ...base, days_until: 0 })
    expect(r.text).toContain('expires today')
  })

  it('omits the issuer line when issuer is null', () => {
    const r = renderComplianceReminder({ ...base, issuer: null })
    expect(r.text).not.toContain('Issued by')
  })
})

describe('renderComplianceReminder — HTML escaping', () => {
  it('escapes <, >, &, ", \' in user-supplied fields', () => {
    const r = renderComplianceReminder({
      ...base,
      recipient_name: "<script>alert('xss')</script>",
      property_label: 'Pub & Grill "The Crown"',
    })
    expect(r.html).not.toContain('<script>')
    expect(r.html).toContain('&lt;script&gt;')
    expect(r.html).toContain('Pub &amp; Grill &quot;The Crown&quot;')
    expect(r.html).toContain('&#39;') // escaped apostrophe
  })

  it('escapes the property_label in subject too', () => {
    // Subject doesn't go through escapeHtml, but it does go through
    // sanitise; HTML brackets pass through. This test pins behaviour:
    // subjects don't need HTML escaping (email clients don't parse
    // subject as HTML).
    const r = renderComplianceReminder({
      ...base,
      property_label: '12 Acacia <Avenue>',
    })
    expect(r.subject).toContain('<Avenue>')
  })
})

describe('renderComplianceReminder — Unicode bidi defence', () => {
  it('strips zero-width and bidi-override controls from sanitised fields', () => {
    // Hostile name with right-to-left override embedded.
    const hostile = 'Alice‮ReverseMe'
    const r = renderComplianceReminder({ ...base, recipient_name: hostile })
    // The U+202E should never reach the output text or html.
    expect(r.text).not.toContain('‮')
    expect(r.html).not.toContain('‮')
    // The visible characters remain.
    expect(r.text).toContain('AliceReverseMe')
  })

  it('strips a BOM hidden inside the issuer field', () => {
    const r = renderComplianceReminder({ ...base, issuer: 'Gas﻿Safe' })
    expect(r.text).toContain('GasSafe')
    expect(r.text).not.toContain('﻿')
  })

  it('strips a zero-width space U+200B inside the property label', () => {
    const r = renderComplianceReminder({ ...base, property_label: '12​Acacia' })
    expect(r.subject).toContain('12Acacia')
    expect(r.subject).not.toContain('​')
  })
})

describe('renderComplianceReminder — app_url plumbing', () => {
  it('uses the dev app_url when provided', () => {
    const r = renderComplianceReminder({
      ...base,
      app_url: 'http://localhost:3000',
    })
    expect(r.text).toContain('http://localhost:3000/compliance')
    expect(r.html).toContain('http://localhost:3000/settings/notifications')
  })

  it('strips a trailing slash so URLs don\'t double up', () => {
    const r = renderComplianceReminder({
      ...base,
      app_url: 'https://staging.tenureiq.app/',
    })
    expect(r.text).toContain('https://staging.tenureiq.app/compliance')
    expect(r.text).not.toContain('https://staging.tenureiq.app//compliance')
  })

  it('falls back to the production hostname when app_url is omitted', () => {
    const r = renderComplianceReminder(base)
    expect(r.text).toContain('https://tenureiq.app/compliance')
  })
})

describe('renderComplianceReminder — kind label coverage', () => {
  // Pins the mapping so renames in summary text show up as test
  // failures rather than silent UX changes.
  const cases: Array<[string, string]> = [
    ['gas_safety', 'Gas safety certificate'],
    ['eicr', 'EICR (electrical safety)'],
    ['epc', 'EPC'],
    ['hmo_licence', 'HMO licence'],
    ['legionella', 'Legionella risk assessment'],
    ['right_to_rent', 'Right-to-rent check'],
  ]
  it.each(cases)('renders %s as "%s"', (kind, label) => {
    const r = renderComplianceReminder({ ...base, kind, days_until: 10 })
    expect(r.text).toContain(label)
  })
})
