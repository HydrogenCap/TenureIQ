// lib/admin/webhook-events.ts
// Owner-only reads of the webhook_events idempotency log, scoped to
// the caller's organisation. Service-role allowed here (lib/admin/ is
// in the convention's allowed paths).
//
// Tenant scoping: webhook_events.organisation_id is set by the Stripe
// handler at insert time (best-effort — see app/api/webhooks/stripe/
// route.ts:resolveOrgIdForEvent). Rows where it couldn't be resolved
// (organisation_id IS NULL) never appear on this page.
//
// We deliberately do NOT surface the payload column in any form. Stripe
// event bodies routinely contain customer email, customer ids, price
// ids, line_items.metadata, and the org's stripe_customer_id. The
// page shows event id + type + status + processed_at + error; full
// inspection happens in the Stripe dashboard.

import 'server-only'
import { supabaseService } from '@/lib/db/admin'

export type WebhookEventRow = {
  id: string
  provider: 'stripe'
  eventId: string
  eventType: string
  processedAt: string | null
  errorMessage: string | null
  createdAt: string
}

type DbRow = {
  id: string
  provider: 'stripe'
  event_id: string
  event_type: string
  processed_at: string | null
  error: string | null
  created_at: string
}

export async function recentWebhookEvents(
  organisationId: string,
  limit = 100,
): Promise<WebhookEventRow[]> {
  const sb = supabaseService()
  const { data, error } = await sb
    .from('webhook_events')
    .select('id, provider, event_id, event_type, processed_at, error, created_at')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    // eslint-disable-next-line no-console
    console.error('recentWebhookEvents failed', error)
    return []
  }
  const rows = (data ?? []) as DbRow[]
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    eventId: r.event_id,
    eventType: r.event_type,
    processedAt: r.processed_at,
    errorMessage: r.error,
    createdAt: r.created_at,
  }))
}

export type WebhookStats = {
  total: number
  processed: number
  failed: number
  unprocessed: number
  last24hCount: number
}

export async function webhookEventStats(
  organisationId: string,
): Promise<WebhookStats> {
  const sb = supabaseService()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [totalRes, processedRes, failedRes, last24hRes] = await Promise.all([
    sb
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', organisationId),
    sb
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .not('processed_at', 'is', null),
    sb
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .not('error', 'is', null),
    sb
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .gte('created_at', dayAgo),
  ])

  const total = totalRes.count ?? 0
  const processed = processedRes.count ?? 0
  const failed = failedRes.count ?? 0
  return {
    total,
    processed,
    failed,
    unprocessed: Math.max(0, total - processed),
    last24hCount: last24hRes.count ?? 0,
  }
}
