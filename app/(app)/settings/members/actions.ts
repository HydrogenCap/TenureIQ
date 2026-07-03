// app/(app)/settings/members/actions.ts
'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { InvitationCreateSchema, ROLES } from '@/lib/schemas/invitation'
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

  const { data: invitation, error: insertError } = await sb
    .from('invitations')
    .insert({
      organisation_id: auth.organisationId,
      email,
      role: parsed.data.role,
      token: randomUUID(),
      invited_by_user_id: auth.userId,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !invitation) {
    return { ok: false, error: insertError?.message ?? 'Failed to create invitation' }
  }

  // TODO(M6): sending the invitation email is out of scope here. The M6 email
  // provider (lib/email/send.ts) should gain an "invitation" template that
  // emails the invitee a sign-in link. Until then, invitees discover the
  // invitation on their onboarding screen (/onboarding) after signing in with
  // the invited email address — the UI copy explains this.

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
