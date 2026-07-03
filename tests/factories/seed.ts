// tests/factories/seed.ts
// Service-role test setup. Lives under tests/factories/ per the allowed
// paths in pre-write-service-role-check.sh.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export type TestUser = { id: string; email: string }

function admin(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function createTestUser(email: string): Promise<TestUser> {
  const sb = admin()
  const { data, error } = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    password: 'test-password-123',
  })

  let id: string
  if (error) {
    // Playwright retries reuse the same fixed spec emails — find and
    // reuse the auth user created by the first attempt.
    const list = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existing = list.data?.users.find((u) => u.email === email)
    if (!existing) throw new Error(`createTestUser: ${error.message}`)
    id = existing.id
  } else if (!data.user) {
    throw new Error('createTestUser: no user')
  } else {
    id = data.user.id
  }

  // Mirror row in public.users — the app creates this during onboarding,
  // and organisation_members.user_id FKs public.users (not auth.users).
  const mirror = await sb.from('users').upsert({ id, email })
  if (mirror.error) throw new Error(`createTestUser mirror: ${mirror.error.message}`)

  return { id, email }
}

export async function createTestOrg(userId: string, name: string): Promise<string> {
  const sb = admin()
  // Unique suffix: slugs are globally unique, and Playwright retries
  // re-create orgs with the same name after a partial first attempt.
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') +
    '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

  const orgRow = await sb
    .from('organisations')
    .insert({ name, slug, owner_user_id: userId })
    .select('id')
    .single<{ id: string }>()
  if (orgRow.error || !orgRow.data) throw new Error(`createTestOrg insert: ${orgRow.error?.message}`)
  const orgId = orgRow.data.id

  const memberRow = await sb.from('organisation_members').insert({
    organisation_id: orgId,
    user_id: userId,
    role: 'owner',
    accepted_at: new Date().toISOString(),
  })
  if (memberRow.error) throw new Error(`createTestOrg member: ${memberRow.error.message}`)

  return orgId
}

export async function generateMagicLink(email: string): Promise<string> {
  const sb = admin()
  const { data, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties?.action_link) {
    throw new Error(`generateMagicLink: ${error?.message ?? 'no link'}`)
  }
  return data.properties.action_link
}

// Token hash for the server-side /auth/confirm flow — avoids the implicit
// hash-fragment redirect, which a cookie-based SSR app never sees.
export async function generateMagicLinkTokenHash(email: string): Promise<string> {
  const sb = admin()
  const { data, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties?.hashed_token) {
    throw new Error(`generateMagicLinkTokenHash: ${error?.message ?? 'no token hash'}`)
  }
  return data.properties.hashed_token
}
