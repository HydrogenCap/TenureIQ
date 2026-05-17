// lib/cron/send-reminders.ts
// Reminder send loop. Called from the Vercel-Cron route handler. Lives
// under lib/cron/ (an allowed path) so the service-role import is
// permitted; the thin route at app/api/cron/send-reminders just wraps
// the secret check + invocation.

import 'server-only'
import { supabaseService } from '@/lib/db/admin'
import { renderTemplate } from '@/lib/email/templates'
import { sendEmail } from '@/lib/email/send'

const MAX_PER_RUN = 100

type ClaimedReminder = {
  id: string
  organisation_id: string
  related_kind: string
  related_id: string
  days_until_event: number
  body_key: string
  context: Record<string, unknown>
  channel: string
  retry_count: number
}

type Recipient = {
  user_id: string
  email: string
  display_name: string | null
}

type MemberRow = {
  user_id: string
  notify_compliance?: boolean
  notify_mortgages?: boolean
  notify_tenancies?: boolean
  user: Array<{ email: string; display_name: string | null }>
}

export type SendRemindersResult = {
  ok: boolean
  processed: number
  failed: number
  error?: string
}

async function logRunStart(job: string): Promise<bigint | null> {
  const sb = supabaseService()
  const { data, error } = await sb
    .from('cron_run_log')
    .insert({ job, status: 'running' })
    .select('id')
    .single<{ id: string | number }>()
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('cron_run_log insert failed', error)
    return null
  }
  return typeof data.id === 'string' ? BigInt(data.id) : BigInt(data.id)
}

async function logRunFinish(
  runId: bigint | null,
  status: 'ok' | 'failed',
  processed: number,
  failed: number,
  errorMessage?: string,
): Promise<void> {
  if (runId === null) return
  const sb = supabaseService()
  await sb
    .from('cron_run_log')
    .update({
      finished_at: new Date().toISOString(),
      status,
      processed,
      failed,
      error_message: errorMessage ?? null,
    })
    .eq('id', runId.toString())
}

async function fetchRecipients(
  organisationId: string,
  relatedKind: string,
): Promise<Recipient[]> {
  const sb = supabaseService()
  const prefColumn =
    relatedKind === 'compliance'
      ? 'notify_compliance'
      : relatedKind === 'mortgage'
        ? 'notify_mortgages'
        : 'notify_tenancies'
  const { data, error } = await sb
    .from('organisation_members')
    .select(`user_id, ${prefColumn}, user:users(email, display_name)`)
    .eq('organisation_id', organisationId)
    .not('accepted_at', 'is', null)
    .is('deleted_at', null)
  if (error) {
    // eslint-disable-next-line no-console
    console.error('fetchRecipients failed', error)
    return []
  }
  const rows = (data ?? []) as MemberRow[]
  return rows
    .filter((r) => {
      const flag =
        relatedKind === 'compliance'
          ? r.notify_compliance
          : relatedKind === 'mortgage'
            ? r.notify_mortgages
            : r.notify_tenancies
      return flag !== false && r.user?.[0]?.email
    })
    .map((r) => {
      const u = r.user[0]
      return {
        user_id: r.user_id,
        email: u?.email ?? '',
        display_name: u?.display_name ?? null,
      }
    })
}

async function fetchPropertyLabel(propertyId: string | undefined): Promise<string> {
  if (!propertyId) return 'your property'
  const sb = supabaseService()
  const { data } = await sb
    .from('properties')
    .select('address_line_1, postcode')
    .eq('id', propertyId)
    .maybeSingle<{ address_line_1: string; postcode: string }>()
  if (!data) return 'your property'
  return `${data.address_line_1}, ${data.postcode}`
}

async function markSent(reminderId: string): Promise<void> {
  const sb = supabaseService()
  await sb
    .from('reminders')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', reminderId)
}

async function markFailed(
  reminderId: string,
  reason: string,
  retries: number,
): Promise<void> {
  const sb = supabaseService()
  const nextStatus = retries + 1 >= 3 ? 'failed' : 'pending'
  await sb
    .from('reminders')
    .update({
      status: nextStatus,
      failed_at: new Date().toISOString(),
      failure_reason: reason.slice(0, 500),
      retry_count: retries + 1,
      claimed_at: null,
      claimed_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reminderId)
}

export async function sendDueReminders(): Promise<SendRemindersResult> {
  const runId = await logRunStart('send-reminders')
  const claimedBy = `vercel-${process.env.VERCEL_DEPLOYMENT_ID ?? process.pid}-${Date.now().toString(36)}`

  let processed = 0
  let failed = 0

  try {
    const sb = supabaseService()
    const { data: rawClaimed, error: claimErr } = await sb.rpc(
      'claim_pending_reminders',
      { p_limit: MAX_PER_RUN, p_claimed_by: claimedBy },
    )
    if (claimErr) {
      await logRunFinish(runId, 'failed', 0, 0, `claim: ${claimErr.message}`)
      return { ok: false, processed: 0, failed: 0, error: claimErr.message }
    }
    const claimed = (rawClaimed ?? []) as ClaimedReminder[]

    const propertyLabelCache = new Map<string, string>()

    for (const r of claimed) {
      let didFail = false
      try {
        const propertyId =
          (r.context['property_id'] as string | undefined) ?? undefined
        const cacheKey = propertyId ?? '__none__'
        let propertyLabel = propertyLabelCache.get(cacheKey)
        if (propertyLabel === undefined) {
          propertyLabel = await fetchPropertyLabel(propertyId)
          propertyLabelCache.set(cacheKey, propertyLabel)
        }

        const recipients = await fetchRecipients(r.organisation_id, r.related_kind)
        if (recipients.length === 0) {
          await markSent(r.id)
          processed++
          continue
        }

        for (const recipient of recipients) {
          const rendered = renderTemplate(r.body_key, {
            ...r.context,
            property_label: propertyLabel,
            recipient_name:
              recipient.display_name ?? recipient.email.split('@')[0],
          })
          if (!rendered) {
            await markFailed(r.id, `Unknown template: ${r.body_key}`, r.retry_count)
            didFail = true
            failed++
            break
          }
          const sent = await sendEmail({
            to: recipient.email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          })
          if (!sent.ok) {
            await markFailed(r.id, sent.error, r.retry_count)
            didFail = true
            failed++
            break
          }
        }

        if (!didFail) {
          await markSent(r.id)
          processed++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown'
        await markFailed(r.id, msg, r.retry_count)
        failed++
      }
    }

    await logRunFinish(runId, 'ok', processed, failed)
    return { ok: true, processed, failed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    await logRunFinish(runId, 'failed', processed, failed, msg)
    return { ok: false, processed, failed, error: msg }
  }
}
