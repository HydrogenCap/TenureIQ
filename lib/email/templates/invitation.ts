// lib/email/templates/invitation.ts
// Sent when an owner/admin invites someone to their organisation
// (app/(app)/settings/members/actions.ts → inviteMember).
//
// Acceptance flow: the recipient signs in (or signs up) with the invited
// email address and lands on /onboarding, where pending invitations are
// matched by email and accepted. There is no token-consumption route yet —
// the `token` query param is carried on the link for forward compatibility
// but the onboarding page currently ignores it.

export type InvitationContext = {
  org_name: string
  // Inviter's display name, falling back to their email address.
  inviter_name: string
  // Human-readable role label, e.g. "Manager" (see ROLE_LABELS in
  // lib/schemas/invitation.ts).
  role_label: string
  // Pre-formatted expiry date, e.g. "10 July 2026".
  expires_on: string
  // The invitations.token value for this invitation.
  token: string
  // Provided at render time so dev / staging links don't point at
  // production. Falls back to the production hostname.
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

export function renderInvitation(ctx: InvitationContext): {
  subject: string
  html: string
  text: string
} {
  const appUrl = (ctx.app_url ?? 'https://tenureiq.app').replace(/\/$/, '')
  const acceptUrl = `${appUrl}/onboarding?token=${encodeURIComponent(ctx.token)}`

  const orgName = sanitise(ctx.org_name)
  const inviter = sanitise(ctx.inviter_name)
  const roleLabel = sanitise(ctx.role_label)
  const expiresOn = sanitise(ctx.expires_on)

  const subject = `You've been invited to ${orgName} on TenureIQ`

  const text = [
    'Hi,',
    '',
    `${inviter} has invited you to join ${orgName} on TenureIQ as ${roleLabel}.`,
    '',
    'Accept the invitation:',
    `  ${acceptUrl}`,
    '',
    'Sign in (or create an account) with this email address and the invitation will be waiting for you.',
    '',
    `This invitation expires on ${expiresOn}.`,
    '',
    '— TenureIQ',
    '',
    "If you weren't expecting this invitation, you can safely ignore this email.",
  ].join('\n')

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
  <p>Hi,</p>
  <p><strong>${escapeHtml(inviter)}</strong> has invited you to join <strong>${escapeHtml(orgName)}</strong> on TenureIQ as <strong>${escapeHtml(roleLabel)}</strong>.</p>
  <p><a href="${escapeHtml(acceptUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Accept invitation</a></p>
  <p style="font-size:14px;color:#555">Sign in (or create an account) with this email address and the invitation will be waiting for you.</p>
  <p style="font-size:14px;color:#555">This invitation expires on ${escapeHtml(expiresOn)}.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <p style="font-size:12px;color:#666">If you weren&#39;t expecting this invitation, you can safely ignore this email.</p>
</body></html>`

  return { subject, html, text }
}
