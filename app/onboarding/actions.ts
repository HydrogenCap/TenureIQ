'use server'

import { z } from 'zod'
import { cookies } from 'next/headers'
import { OrganisationCreateSchema } from '@/lib/schemas/organisation'
import { supabaseServer } from '@/lib/db/user'

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

const ORG_COOKIE = 'tenureiq_org'

export async function createOrganisation(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = OrganisationCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const sb = await supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (!user.email) return { ok: false, error: 'Your account has no email address' }

  // Ensure the user mirror row exists in public.users
  await sb.from('users').upsert({
    id: user.id,
    email: user.email,
    display_name: user.user_metadata?.full_name ?? null,
  })

  // Create the organisation
  const { data: org, error: orgError } = await sb
    .from('organisations')
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      owner_user_id: user.id,
    })
    .select('id')
    .single()

  if (orgError) {
    if (orgError.code === '23505') {
      return {
        ok: false,
        error: 'Validation failed',
        fieldErrors: { slug: ['That slug is already taken'] },
      }
    }
    return { ok: false, error: orgError.message }
  }

  // Self-membership as owner
  const { error: memberError } = await sb.from('organisation_members').insert({
    organisation_id: org.id,
    user_id: user.id,
    role: 'owner',
    accepted_at: new Date().toISOString(),
  })

  if (memberError) return { ok: false, error: memberError.message }

  // Set the org cookie
  const cookieStore = await cookies()
  cookieStore.set(ORG_COOKIE, org.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  return { ok: true, data: { id: org.id } }
}

const AcceptInvitationSchema = z.object({
  invitationId: z.string().uuid(),
})

export async function acceptInvitation(input: unknown): Promise<ActionResult> {
  const parsed = AcceptInvitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid invitation id' }

  const sb = await supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: invitation, error: lookupError } = await sb
    .from('invitations')
    .select('id, organisation_id, role, email, expires_at, accepted_at, revoked_at')
    .eq('id', parsed.data.invitationId)
    .single()

  if (lookupError || !invitation) return { ok: false, error: 'Invitation not found' }
  if (!user.email || invitation.email !== user.email) return { ok: false, error: 'Invitation is for a different email address' }
  if (invitation.accepted_at) return { ok: false, error: 'Invitation already accepted' }
  if (invitation.revoked_at) return { ok: false, error: 'Invitation has been revoked' }
  if (new Date(invitation.expires_at) < new Date()) return { ok: false, error: 'Invitation has expired' }

  // Mirror user
  await sb.from('users').upsert({ id: user.id, email: user.email })

  // Create membership
  const { error: memberError } = await sb.from('organisation_members').insert({
    organisation_id: invitation.organisation_id,
    user_id: user.id,
    role: invitation.role,
    accepted_at: new Date().toISOString(),
  })
  if (memberError) return { ok: false, error: memberError.message }

  // Mark invitation accepted
  await sb
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  // Set org cookie
  const cookieStore = await cookies()
  cookieStore.set(ORG_COOKIE, invitation.organisation_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  return { ok: true, data: undefined }
}
