// app/api/cron/send-reminders/route.ts
// Vercel Cron entry point. Verifies the shared secret then delegates
// to lib/cron/send-reminders, which holds the service-role logic in
// an allowed path.

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { env } from '@/env'
import { sendDueReminders } from '@/lib/cron/send-reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function verifySecret(req: Request): boolean {
  // Fail closed in production — without a CRON_SECRET there is no auth
  // on the cron route, and it would be world-callable.
  if (!env.CRON_SECRET) {
    if (env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.error('CRON_SECRET unset in production — refusing cron run')
    }
    return false
  }
  const header = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${env.CRON_SECRET}`
  // Constant-time compare to avoid leaking the secret one byte at a time
  // via remote timing. timingSafeEqual throws on length mismatch, so
  // length-check first; do an equal-length compare in the mismatch
  // branch to keep the cost stable.
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!verifySecret(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const result = await sendDueReminders()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
