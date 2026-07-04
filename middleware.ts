// middleware.ts
// Supabase session refresh (the @supabase/ssr-recommended pattern).
// Without this, auth tokens only refresh when a server component happens
// to call getUser(), so long-idle sessions expire silently and users get
// bounced to /login mid-task. The middleware refreshes the token on every
// matched request and forwards the updated cookies both to the handler
// (via the mutated request) and to the browser (via the response).

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

type CookieToSet = { name: string; value: string; options: CookieOptions }

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser() validates the JWT against Supabase and refreshes it when
  // expired — that side effect is the whole point of this middleware.
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  // Everything except static assets and the token-authenticated machine
  // routes (webhooks + cron use bearer secrets, not session cookies).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|api/webhooks|api/cron|api/jobs).*)',
  ],
}
