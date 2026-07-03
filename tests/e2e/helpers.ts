// tests/e2e/helpers.ts
// Playwright helpers for the tenant-isolation suite.
// Service-role setup lives in tests/factories/seed.ts (the only path the
// pre-write-service-role-check hook allows for admin operations from tests).

import type { Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { createTestUser, createTestOrg, generateMagicLinkTokenHash } from '@/tests/factories/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export { createTestUser, createTestOrg }

interface SignInUser {
  (page: Page, email: string): Promise<void>
  api: (email: string) => Promise<SupabaseClient<Database>>
}

const signInUserImpl: SignInUser = (async (page: Page, email: string) => {
  // Server-side token-hash verification (/auth/confirm) — the admin
  // action_link redirects with tokens in the URL hash, which the
  // cookie-based SSR app never receives.
  const tokenHash = await generateMagicLinkTokenHash(email)
  await page.goto(`/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=/dashboard`)
  await page.waitForURL((url) => !url.pathname.startsWith('/login') && !url.pathname.startsWith('/auth'))
}) as SignInUser

signInUserImpl.api = async (email: string) => {
  const sb = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await sb.auth.signInWithPassword({ email, password: 'test-password-123' })
  if (error) throw new Error(`signInUser.api: ${error.message}`)
  return sb
}

export const signInUser = signInUserImpl
