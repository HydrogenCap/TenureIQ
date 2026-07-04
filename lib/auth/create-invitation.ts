// lib/auth/create-invitation.ts
// Shared invitation core. Both "invite a teammate" (settings/members)
// and "invite an investor to the portal" (investors) create rows in the
// same `invitations` table — extracting the duplicate checks, token
// mint, TTL, and non-fatal email send here keeps the two entry points
// behaviour-identical instead of drifting apart as 150-line copies.
//
// Auth is deliberately NOT done here: callers must requireOrgRole first
// and pass the verified organisationId/userId from that auth context.
// All queries still run through the RLS-enforced client, so even a
// buggy caller cannot reach across organisations.

import 'server-only'

import { randomUUID } from 'node:crypto'
import { env } from '@/env'
import { supabaseServer } from '@/lib/db/user'
import { sendEmail } from '@/lib/email/send'
import { renderInvitation } from '@/lib/email/templates/invitation'
import { ROLE_LABELS, type InvitableRole } from '@/lib/schemas/invitation'
import type { ActionResult } from '@/lib/types/action-result'

const INVITATION_TTL_DAYS = 7

export async function createInvitation(params: {
  organisationId: string
  invitedByUserId: string
  email: string
  role: InvitableRole
}): Promise<ActionResult<{ id: string }>> {
  const email = params.email.trim().toLowerCase()
  const sb = await supabaseServer()

  // Reject if the email already belongs to an accepted member of this org.
  // Note: users_self_select RLS means the inner join only resolves for the
  // caller's own users row, so in practice this catches self-invites; other
  // duplicates are still blocked by the unique (organisation_id, user_id)
  // constraint at accept time.
  const { data: existingMember, error: memberLookupError } = await sb
    .from('organisation_members')
    .select('id, users!inner(email)')
    .eq('organisation_id', params.organisationId)
    .eq('users.email', email)
    .not('accepted_at', 'is', null)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (memberLookupError) return { ok: false, error: memberLookupError.message }
  if (existingMember) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: { email: ['That person is already a member of this organisation'] },
    }
  }

  // Reject if there is already a pending (not accepted, not revoked, unexpired)
  // invitation for this email.
  const { data: pendingInvite, error: inviteLookupError } = await sb
    .from('invitations')
    .select('id')
    .eq('organisation_id', params.organisationId)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle()

  if (inviteLookupError) return { ok: false, error: inviteLookupError.message }
  if (pendingInvite) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: { email: ['There is already a pending invitation for that email'] },
    }
  }

  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
  const token = randomUUID()

  const { data: invitation, error: insertError } = await sb
    .from('invitations')
    .insert({
      organisation_id: params.organisationId,
      email,
      role: params.role,
      token,
      invited_by_user_id: params.invitedByUserId,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !invitation) {
    return { ok: false, error: insertError?.message ?? 'Failed to create invitation' }
  }

  // Send the invitation email (console provider in dev, Resend in prod —
  // lib/email/send.ts picks). Email failure is deliberately non-fatal: the
  // invitation row already exists and the invitee can still discover it on
  // /onboarding after signing in with the invited address, so we log and
  // return ok rather than failing the action.
  try {
    const [{ data: inviter }, { data: org }] = await Promise.all([
      sb
        .from('users')
        .select('display_name, email')
        .eq('id', params.invitedByUserId)
        .maybeSingle(),
      sb.from('organisations').select('name').eq('id', params.organisationId).maybeSingle(),
    ])

    const rendered = renderInvitation({
      org_name: org?.name ?? 'your organisation',
      inviter_name: inviter?.display_name ?? inviter?.email ?? 'A colleague',
      role_label: ROLE_LABELS[params.role],
      expires_on: expiresAt.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      token,
      app_url: env.NEXT_PUBLIC_APP_URL,
    })

    const sent = await sendEmail({ to: email, ...rendered })
    if (!sent.ok) {
      console.error(`createInvitation: invitation email to ${email} failed: ${sent.error}`)
    }
  } catch (err) {
    console.error('createInvitation: invitation email failed', err)
  }

  return { ok: true, data: { id: invitation.id } }
}
