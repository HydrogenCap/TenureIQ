// lib/auth/require.ts
// Auth guards used by server actions and route handlers.

import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/db/user'

export type Role = 'owner' | 'admin' | 'manager' | 'accountant' | 'viewer'

export type AuthResult =
  | { ok: true; userId: string; organisationId: string; role: Role }
  | { ok: false; error: string }

const ORG_COOKIE = 'tenureiq_org'

export async function requireOrgMember(): Promise<AuthResult> {
  const sb = await supabaseServer()

  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) return { ok: false, error: 'Not authenticated' }

  const cookieStore = await cookies()
  const organisationId = cookieStore.get(ORG_COOKIE)?.value

  if (!organisationId) return { ok: false, error: 'No organisation selected' }

  const { data: member, error } = await sb
    .from('organisation_members')
    .select('role, accepted_at, deleted_at')
    .eq('user_id', user.id)
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .single()

  if (error || !member || !member.accepted_at) {
    return { ok: false, error: 'Not a member of this organisation' }
  }

  return {
    ok: true,
    userId: user.id,
    organisationId,
    role: member.role as Role,
  }
}

export async function requireOrgRole(allowed: Role[]): Promise<AuthResult> {
  const auth = await requireOrgMember()
  if (!auth.ok) return auth
  if (!allowed.includes(auth.role)) {
    return { ok: false, error: `Requires role: ${allowed.join(' or ')}` }
  }
  return auth
}
