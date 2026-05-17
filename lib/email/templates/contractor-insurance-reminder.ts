// lib/email/templates/contractor-insurance-reminder.ts
// Fired when a contractor's insurance_expiry is approaching.

export type ContractorInsuranceContext = {
  contractor_id: string
  contractor_name: string
  insurance_expiry: string
  days_until: number
  recipient_name: string
  app_url?: string
}

function sanitise(s: string): string {
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

export function renderContractorInsuranceReminder(ctx: ContractorInsuranceContext): {
  subject: string
  html: string
  text: string
} {
  const appUrl = (ctx.app_url ?? 'https://tenureiq.app').replace(/\/$/, '')
  const contractorUrl = `${appUrl}/contractors/${ctx.contractor_id}`
  const notificationsUrl = `${appUrl}/settings/notifications`
  const name = sanitise(ctx.contractor_name)

  const summary =
    ctx.days_until < 0
      ? `${name}'s insurance expired ${-ctx.days_until} days ago (${ctx.insurance_expiry}).`
      : ctx.days_until === 0
        ? `${name}'s insurance expires today (${ctx.insurance_expiry}).`
        : `${name}'s insurance expires in ${ctx.days_until} days (${ctx.insurance_expiry}).`

  const subject =
    ctx.days_until < 0
      ? `[Expired] ${name} insurance`
      : ctx.days_until === 0
        ? `[Today] ${name} insurance`
        : `${name} insurance expires in ${ctx.days_until}d`

  const text = [
    `Hi ${sanitise(ctx.recipient_name)},`,
    '',
    summary,
    '',
    "Don't assign new jobs to this contractor until their cover is renewed — your own insurance may require it and a court certainly will.",
    '',
    `Open contractor: ${contractorUrl}`,
    '',
    '— TenureIQ',
    '',
    `Manage notifications at ${notificationsUrl}.`,
  ].join('\n')

  const colour =
    ctx.days_until < 0 ? '#b91c1c' : ctx.days_until <= 7 ? '#b45309' : '#222'

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
  <p>Hi ${escapeHtml(ctx.recipient_name)},</p>
  <p style="font-weight:600;color:${colour}">Contractor insurance</p>
  <p>${escapeHtml(summary)}</p>
  <p style="font-size:14px;color:#555">Don't assign new jobs to this contractor until cover is renewed.</p>
  <p><a href="${escapeHtml(contractorUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open contractor</a></p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <p style="font-size:12px;color:#666"><a href="${escapeHtml(notificationsUrl)}">Manage your notifications</a>.</p>
</body></html>`

  return { subject, html, text }
}
