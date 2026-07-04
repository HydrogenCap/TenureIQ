// app/(app)/notifications-actions.ts
// Read-only feed for the header notification bell. The reminders table is
// the source of truth (no schema changes) — this action just projects a
// recent, org-scoped window of it. Per-user "seen" state lives client-side
// in the bell (localStorage); cross-device read-sync is out of scope.
'use server'

import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import type { ActionResult } from '@/lib/types/action-result'
import {
  mapReminderToNotification,
  type NotificationItem,
  type ReminderRow,
} from '@/lib/domain/notifications'

const DAY_MS = 86_400_000
// Window: recently sent (30 days back) plus imminent pending (14 days
// ahead) so the panel shows both "what fired" and "what's coming".
const LOOKBACK_DAYS = 30
const LOOKAHEAD_DAYS = 14
const LIMIT = 25

export async function listNotifications(): Promise<ActionResult<NotificationItem[]>> {
  const auth = await requireOrgMember()
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const now = Date.now()
  const from = new Date(now - LOOKBACK_DAYS * DAY_MS).toISOString()
  const to = new Date(now + LOOKAHEAD_DAYS * DAY_MS).toISOString()

  // RLS scopes this already; the explicit organisation_id + deleted_at
  // filters are belt-and-braces per convention. claimed/failed/superseded
  // rows are queue internals and never surface to users.
  const { data, error } = await sb
    .from('reminders')
    .select('id, related_kind, related_id, body_key, context, trigger_at, status')
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .in('status', ['sent', 'pending'])
    .gte('trigger_at', from)
    .lte('trigger_at', to)
    .order('trigger_at', { ascending: false })
    .limit(LIMIT)

  if (error) return { ok: false, error: error.message }

  // The generated Database type is still the `any` stub, so the row shape is
  // asserted the same way the rest of the codebase does it.
  const rows = (data ?? []) as ReminderRow[]
  return { ok: true, data: rows.map(mapReminderToNotification) }
}
