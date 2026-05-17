// lib/email/templates/aasc-break-reminder.ts
// Fired when an AASC contract's break-clause date is approaching.

export type AascBreakReminderContext = {
  contractor: string
  break_clause_date: string
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

export function renderAascBreakReminder(ctx: AascBreakReminderContext): {
  subject: string
  html: string
  text: string
} {
  const appUrl = (ctx.app_url ?? 'https://tenureiq.app').replace(/\/$/, '')
  const aascUrl = `${appUrl}/aasc/contracts`
  const notificationsUrl = `${appUrl}/settings/notifications`
  const contractor = sanitise(ctx.contractor)

  const summary =
    ctx.days_until === 0
      ? `${contractor} contract break clause is today (${ctx.break_clause_date}).`
      : `${contractor} contract break clause in ${ctx.days_until} days (${ctx.break_clause_date}).`

  const subject =
    ctx.days_until === 0
      ? `[Today] ${contractor} break clause`
      : `${contractor} break clause in ${ctx.days_until}d`

  const text = [
    `Hi ${sanitise(ctx.recipient_name)},`,
    '',
    summary,
    '',
    'Decide whether to invoke the break or let it pass. If you do nothing it lapses.',
    '',
    `Manage contracts: ${aascUrl}`,
    '',
    '— TenureIQ',
    '',
    `Manage notifications at ${notificationsUrl}.`,
  ].join('\n')

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
  <p>Hi ${escapeHtml(ctx.recipient_name)},</p>
  <p style="font-weight:600;color:${ctx.days_until <= 7 ? '#b45309' : '#222'}">Break clause approaching</p>
  <p>${escapeHtml(summary)}</p>
  <p style="font-size:14px;color:#555">Decide whether to invoke the break or let it pass. If you do nothing it lapses.</p>
  <p><a href="${escapeHtml(aascUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open AASC contracts</a></p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <p style="font-size:12px;color:#666"><a href="${escapeHtml(notificationsUrl)}">Manage your notifications</a>.</p>
</body></html>`

  return { subject, html, text }
}
