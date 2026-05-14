// lib/db/user.ts
// User-facing Supabase client. RLS enforced via session cookie.
// Use this in: server actions, route handlers called by users, RSC data fetches.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from '@/env'
import type { Database } from '@/types/supabase'

export async function supabaseServer() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // RSC read-only context — Auth flow will refresh on next request.
          }
        },
      },
    }
  )
}
