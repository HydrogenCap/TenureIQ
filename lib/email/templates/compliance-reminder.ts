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

function escapeHtml(s: string): string {
  return s
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

  const subject =
    ctx.days_until < 0
      ? `[Expired] ${KIND_LABELS[ctx.kind] ?? ctx.kind} — ${ctx.property_label}`
      : ctx.days_until === 0
        ? `[Today] ${KIND_LABELS[ctx.kind] ?? ctx.kind} — ${ctx.property_label}`
        : `${KIND_LABELS[ctx.kind] ?? ctx.kind} expires in ${ctx.days_until}d — ${ctx.property_label}`

  const text = [
    `Hi ${ctx.recipient_name},`,
    '',
    summary,
    ctx.issuer ? `Issued by: ${ctx.issuer}` : null,
    '',
    'Manage in TenureIQ:',
    '  https://tenureiq.app/compliance',
    '',
    '— TenureIQ',
    '',
    "You're receiving this because compliance notifications are on for your TenureIQ account. Manage at /settings/notifications.",
  ]
    .filter((l) => l !== null)
    .join('\n')

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
  <p>Hi ${escapeHtml(ctx.recipient_name)},</p>
  <p style="font-weight:600;color:${ctx.days_until < 0 ? '#b91c1c' : ctx.days_until <= 7 ? '#b45309' : '#222'}">${escapeHtml(urgency)}</p>
  <p>${escapeHtml(summary)}</p>
  ${ctx.issuer ? `<p>Issued by: ${escapeHtml(ctx.issuer)}</p>` : ''}
  <p><a href="https://tenureiq.app/compliance" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in TenureIQ</a></p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <p style="font-size:12px;color:#666">You're receiving this because compliance notifications are on for your TenureIQ account. <a href="https://tenureiq.app/settings/notifications">Manage your notifications</a>.</p>
</body></html>`

  return { subject, html, text }
}
