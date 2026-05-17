// lib/email/templates/compliance-reminder.ts
// Single-template-per-file pattern so adding a template = adding a file.
// Keep them as plain functions returning {subject, html, text}. No MJML
// for v1 — landlords read these in their phone's inbox preview, not in
// a design portfolio.

export type ComplianceReminderContext = {
  kind: string
  expiry_date: string
  days_until: number
  property_label: string
  issuer: string | null
  recipient_name: string
  // Provided by the cron route at render time so dev / staging links
  // don't point at production. Falls back to the production hostname.
  app_url?: string
}

const KIND_LABELS: Record<string, string> = {
  gas_safety: 'Gas safety certificate',
  eicr: 'EICR (electrical safety)',
  epc: 'EPC',
  pat: 'PAT testing',
  hmo_licence: 'HMO licence',
  fire_risk_assessment: 'Fire risk assessment',
  fire_alarm_test: 'Fire alarm test',
  fire_alarm: 'Fire alarm system',
  emergency_lighting: 'Emergency lighting',
  legionella: 'Legionella risk assessment',
  asbestos: 'Asbestos survey',
  asbestos_survey: 'Asbestos survey',
  oil_safety: 'Oil safety certificate',
  co_alarm: 'CO alarm certificate',
  smoke_alarm: 'Smoke alarm certificate',
  deposit_protection: 'Deposit protection',
  right_to_rent: 'Right-to-rent check',
  insurance: 'Insurance',
  other: 'Compliance item',
}

function summaryLine(ctx: ComplianceReminderContext): string {
  const label = KIND_LABELS[ctx.kind] ?? ctx.kind.replace(/_/g, ' ')
  if (ctx.days_until > 0) {
    return `${label} for ${ctx.property_label} expires in ${ctx.days_until} day${ctx.days_until === 1 ? '' : 's'} (${ctx.expiry_date}).`
  }
  if (ctx.days_until === 0) {
    return `${label} for ${ctx.property_label} expires today (${ctx.expiry_date}).`
  }
  return `${label} for ${ctx.property_label} expired ${-ctx.days_until} day${ctx.days_until === -1 ? '' : 's'} ago (${ctx.expiry_date}).`
}

// Strip Unicode bidi-override + zero-width controls before escaping.
// Some email clients honour these and a hostile display_name could
// flip rendered text direction or smuggle invisible content into
// the subject. Cheap defence in depth.
function sanitise(s: string): string {
  // Match: U+200B-200F (zero-width), U+202A-202E (bidi overrides),
  // U+2066-2069 (LRI/RLI/FSI/PDI), U+FEFF (BOM).
  return s.replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
}

function escapeHtml(s: string): string {
  return sanitise(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderComplianceReminder(ctx: ComplianceReminderContext): {
  subject: string
  html: string
  text: string
} {
  const summary = summaryLine(ctx)
  const urgency =
    ctx.days_until < 0 ? '⚠ Expired' : ctx.days_until <= 7 ? '⚠ Action needed' : 'Heads-up'

  const safeKind = sanitise(KIND_LABELS[ctx.kind] ?? ctx.kind)
  const safeLabel = sanitise(ctx.property_label)
  const subject =
    ctx.days_until < 0
      ? `[Expired] ${safeKind} — ${safeLabel}`
      : ctx.days_until === 0
        ? `[Today] ${safeKind} — ${safeLabel}`
        : `${safeKind} expires in ${ctx.days_until}d — ${safeLabel}`

  const appUrl = (ctx.app_url ?? 'https://tenureiq.app').replace(/\/$/, '')
  const complianceUrl = `${appUrl}/compliance`
  const notificationsUrl = `${appUrl}/settings/notifications`

  const text = [
    `Hi ${sanitise(ctx.recipient_name)},`,
    '',
    sanitise(summary),
    ctx.issuer ? `Issued by: ${sanitise(ctx.issuer)}` : null,
    '',
    'Manage in TenureIQ:',
    `  ${complianceUrl}`,
    '',
    '— TenureIQ',
    '',
    `You're receiving this because compliance notifications are on for your TenureIQ account. Manage at ${notificationsUrl}.`,
  ]
    .filter((l) => l !== null)
    .join('\n')

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
  <p>Hi ${escapeHtml(ctx.recipient_name)},</p>
  <p style="font-weight:600;color:${ctx.days_until < 0 ? '#b91c1c' : ctx.days_until <= 7 ? '#b45309' : '#222'}">${escapeHtml(urgency)}</p>
  <p>${escapeHtml(summary)}</p>
  ${ctx.issuer ? `<p>Issued by: ${escapeHtml(ctx.issuer)}</p>` : ''}
  <p><a href="${escapeHtml(complianceUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in TenureIQ</a></p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <p style="font-size:12px;color:#666">You're receiving this because compliance notifications are on for your TenureIQ account. <a href="${escapeHtml(notificationsUrl)}">Manage your notifications</a>.</p>
</body></html>`

  return { subject, html, text }
}
