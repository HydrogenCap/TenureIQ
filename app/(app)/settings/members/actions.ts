// app/(app)/settings/members/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireOrgRole } from '@/lib/auth/require'
import { createInvitation } from '@/lib/auth/create-invitation'
import { supabaseServer } from '@/lib/db/user'
import { InvitationCreateSchema, ROLES } from '@/lib/schemas/invitation'
import type { ActionResult } from '@/lib/types/action-result'

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

  // Duplicate checks, token mint, insert, and the non-fatal email send
  // all live in the shared helper so the investor portal invite
  // (app/(app)/investors/actions.ts) stays behaviour-identical with
  // this path.
  const result = await createInvitation({
    organisationId: auth.organisationId,
    invitedByUserId: auth.userId,
    email: parsed.data.email,
    role: parsed.data.role,
  })
  if (!result.ok) return result

  revalidatePath('/settings/members')
  return result
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
