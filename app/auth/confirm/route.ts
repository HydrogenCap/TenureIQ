// app/auth/confirm/route.ts
// Token-hash verification for magic links (the @supabase/ssr-recommended
// flow): verifies the OTP server-side and sets the session cookies, so
// no client-side hash handling is needed. Used by the e2e sign-in helper
// and available for the production email template
// ({{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink).

import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseServer } from '@/lib/db/user'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/onboarding'

  if (tokenHash && type) {
    const sb = await supabaseServer()
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_confirm_failed`)
}
