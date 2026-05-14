// lib/db/admin.ts
// Service-role Supabase client. BYPASSES RLS.
// Restricted by ESLint and a pre-write hook to: lib/jobs/, lib/admin/, lib/cron/, app/api/webhooks/.

import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import type { Database } from '@/types/supabase'

let _client: ReturnType<typeof createClient<Database>> | null = null

export function supabaseService() {
  if (!_client) {
    _client = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )
  }
  return _client
}
