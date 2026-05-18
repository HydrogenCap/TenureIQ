// lib/admin/webhook-events.ts
// Owner-only reads of the webhook_events idempotency log. Service-role
// allowed here (lib/admin/ is in the convention's allowed paths).
//
// The payload column is intentionally not returned in full — even with
// the strip_webhook_signature_headers trigger, the body still contains
// account-level customer ids + amounts that we don't want re-exposed in
// the user-facing tree. We surface the event type + status + a short
// snippet for diagnostics; deep inspection happens in the Stripe
// dashboard.

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
  // First ~200 chars of a stringified payload, signatures stripped.
  payloadPreview: string
}

type DbRow = {
  id: string
  provider: 'stripe'
  event_id: string
  event_type: string
  payload: unknown
  processed_at: string | null
  error: string | null
  created_at: string
}

function previewPayload(payload: unknown): string {
  try {
    const s = JSON.stringify(payload)
    if (typeof s !== 'string') return ''
    return s.length > 200 ? `${s.slice(0, 200)}…` : s
  } catch {
    return ''
  }
}

export async function recentWebhookEvents(limit = 100): Promise<WebhookEventRow[]> {
  const sb = supabaseService()
  const { data, error } = await sb
    .from('webhook_events')
    .select('id, provider, event_id, event_type, payload, processed_at, error, created_at')
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
    payloadPreview: previewPayload(r.payload),
  }))
}

export type WebhookStats = {
  total: number
  processed: number
  failed: number
  unprocessed: number
  last24hCount: number
}

export async function webhookEventStats(): Promise<WebhookStats> {
  const sb = supabaseService()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [totalRes, processedRes, failedRes, last24hRes] = await Promise.all([
    sb.from('webhook_events').select('id', { count: 'exact', head: true }),
    sb
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
      .not('processed_at', 'is', null),
    sb
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
      .not('error', 'is', null),
    sb
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
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
