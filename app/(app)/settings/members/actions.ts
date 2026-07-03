// app/(app)/settings/members/actions.ts
'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { env } from '@/env'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { sendEmail } from '@/lib/email/send'
import { renderInvitation } from '@/lib/email/templates/invitation'
import { InvitationCreateSchema, ROLES, ROLE_LABELS } from '@/lib/schemas/invitation'
import type { ActionResult } from '@/lib/types/action-result'

const INVITATION_TTL_DAYS = 7

export async function inviteMember(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = InvitationCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const email = parsed.data.email.trim().toLowerCase()
  const sb = await supabaseServer()

  // Reject if the email already belongs to an accepted member of this org.
  // Note: users_self_select RLS means the inner join only resolves for the
  // caller's own users row, so in practice this catches self-invites; other
  // duplicates are still blocked by the unique (organisation_id, user_id)
  // constraint at accept time.
  const { data: existingMember, error: memberLookupError } = await sb
    .from('organisation_members')
    .select('id, users!inner(email)')
    .eq('organisation_id', auth.organisationId)
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
    .eq('organisation_id', auth.organisationId)
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
      organisation_id: auth.organisationId,
      email,
      role: parsed.data.role,
      token,
      invited_by_user_id: auth.userId,
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
      sb.from('users').select('display_name, email').eq('id', auth.userId).maybeSingle(),
      sb.from('organisations').select('name').eq('id', auth.organisationId).maybeSingle(),
    ])

    const rendered = renderInvitation({
      org_name: org?.name ?? 'your organisation',
      inviter_name: inviter?.display_name ?? inviter?.email ?? 'A colleague',
      role_label: ROLE_LABELS[parsed.data.role],
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
      console.error(`inviteMember: invitation email to ${email} failed: ${sent.error}`)
    }
  } catch (err) {
    console.error('inviteMember: invitation email failed', err)
  }

  revalidatePath('/settings/members')
  return { ok: true, data: { id: invitation.id } }
}

const RevokeInvitationSchema = z.object({
  invitationId: z.string().uuid(),
})

export async function revokeInvitation(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = RevokeInvitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid invitation id' }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', parsed.data.invitationId)
    .eq('organisation_id', auth.organisationId)
    .is('accepted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/members')
  return { ok: true, data: undefined }
}

const UpdateMemberRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(ROLES),
})

export async function updateMemberRole(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = UpdateMemberRoleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Validation failed' }

  const sb = await supabaseServer()

  const { data: target, error: lookupError } = await sb
    .from('organisation_members')
    .select('id, role')
    .eq('id', parsed.data.memberId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (lookupError) return { ok: false, error: lookupError.message }
  if (!target) return { ok: false, error: 'Member not found' }
  if (target.role === 'owner') {
    return { ok: false, error: 'Transfer ownership is not supported yet.' }
  }

  const { error } = await sb
    .from('organisation_members')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.memberId)
    .eq('organisation_id', auth.organisationId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/members')
  return { ok: true, data: undefined }
}

const RemoveMemberSchema = z.object({
  memberId: z.string().uuid(),
})

export async function removeMember(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = RemoveMemberSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid member id' }

  const sb = await supabaseServer()

  const { data: target, error: lookupError } = await sb
    .from('organisation_members')
    .select('id, role, user_id')
    .eq('id', parsed.data.memberId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (lookupError) return { ok: false, error: lookupError.message }
  if (!target) return { ok: false, error: 'Member not found' }
  if (target.role === 'owner') {
    return { ok: false, error: 'The organisation owner cannot be removed.' }
  }
  if (target.user_id === auth.userId) {
    return { ok: false, error: 'Leave organisation is not supported yet.' }
  }

  const { error } = await sb
    .from('organisation_members')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', parsed.data.memberId)
    .eq('organisation_id', auth.organisationId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/members')
  return { ok: true, data: undefined }
}
