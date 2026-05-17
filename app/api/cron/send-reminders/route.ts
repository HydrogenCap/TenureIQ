// app/api/cron/send-reminders/route.ts
// Vercel Cron entry point. Verifies the shared secret then delegates
// to lib/cron/send-reminders, which holds the service-role logic in
// an allowed path.

import { NextResponse } from 'next/server'
import { env } from '@/env'
import { sendDueReminders } from '@/lib/cron/send-reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function verifySecret(req: Request): boolean {
  if (!env.CRON_SECRET) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${env.CRON_SECRET}`
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!verifySecret(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const result = await sendDueReminders()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
