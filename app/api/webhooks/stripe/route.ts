// app/api/webhooks/stripe/route.ts
//
// Stripe webhook handler. Allowed-path for service role (app/api/
// webhooks/* per the convention). Verifies signature, inserts the
// raw event into webhook_events for idempotency, then handles
// subscription / customer / invoice lifecycle events.

import 'server-only'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db/admin'
import { env } from '@/env'
import { verifyStripeSignature } from '@/lib/stripe/webhook-signature'
import {
  deriveOrgPlanState,
  type SubscriptionChangeEventType,
} from '@/lib/stripe/derive-org-plan-state'

// Minimal Zod shape for an inbound Stripe event. We trust the signature
// (verified above) but not the JSON schema — a future Stripe API
// version that omits `data.object` would otherwise crash deep in the
// handler. Permissive on the inner fields (Stripe adds objects all the
// time); strict on the envelope.
const StripeEventEnvelope = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({
    object: z.record(z.string(), z.unknown()),
  }),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Webhooks should be fast; 30s is comfortable.
export const maxDuration = 30

type StripeEvent = {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}
function asBool(v: unknown): boolean {
  return v === true
}
function isoFromUnix(v: unknown): string | null {
  return typeof v === 'number' && Number.isFinite(v)
    ? new Date(v * 1000).toISOString()
    : null
}

// Plan + plan_status derivation lives in lib/stripe/derive-org-plan-state
// so the branching can be unit-tested in isolation.

type SubObj = {
  id?: string
  customer?: string
  items?: { data?: Array<{ price?: { id?: string } }> }
  status?: string
  cancel_at_period_end?: boolean
  current_period_start?: number
  current_period_end?: number
  metadata?: Record<string, string>
}

async function handleSubscriptionChange(event: StripeEvent): Promise<void> {
  const sub = event.data.object as SubObj
  const stripeSubId = asString(sub.id)
  const customerId = asString(sub.customer)
  const priceId = sub.items?.data?.[0]?.price?.id ?? null
  const status = asString(sub.status) ?? 'unknown'
  if (!stripeSubId || !customerId) return

  const sb = supabaseService()
  // Resolve organisation_id via stripe_customer_id on the organisations
  // row, OR fall back to metadata.organisation_id if the customer
  // hasn't been linked yet.
  let organisationId: string | null = sub.metadata?.organisation_id ?? null
  if (!organisationId) {
    const { data: org } = await sb
      .from('organisations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle<{ id: string }>()
    organisationId = org?.id ?? null
  }
  if (!organisationId) {
    // eslint-disable-next-line no-console
    console.error('stripe webhook: subscription change for unknown org', {
      stripeSubId,
      customerId,
    })
    return
  }

  // Upsert the subscription row.
  await sb
    .from('subscriptions')
    .upsert(
      {
        organisation_id: organisationId,
        stripe_subscription_id: stripeSubId,
        stripe_price_id: priceId ?? '',
        status,
        current_period_start: isoFromUnix(sub.current_period_start) ?? new Date().toISOString(),
        current_period_end: isoFromUnix(sub.current_period_end) ?? new Date().toISOString(),
        cancel_at_period_end: asBool(sub.cancel_at_period_end),
        metadata: sub.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'stripe_subscription_id' },
    )

  // Mirror status onto the organisation. See deriveOrgPlanState for
  // the full rule table.
  const { plan, planStatus } = deriveOrgPlanState({
    eventType: event.type as SubscriptionChangeEventType,
    subscriptionStatus: status,
    priceId,
    priceIdMap: {
      starter: env.STRIPE_PRICE_STARTER_MONTHLY,
      growth: env.STRIPE_PRICE_GROWTH_MONTHLY,
      pro: env.STRIPE_PRICE_PRO_MONTHLY,
    },
  })
  await sb
    .from('organisations')
    .update({
      plan,
      plan_status: planStatus,
      plan_renews_at: isoFromUnix(sub.current_period_end),
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organisationId)
}

type CustomerObj = { id?: string; email?: string; metadata?: Record<string, string> }

async function handleCustomerCreated(event: StripeEvent): Promise<void> {
  const customer = event.data.object as CustomerObj
  const customerId = asString(customer.id)
  const organisationId = customer.metadata?.organisation_id ?? null
  if (!customerId || !organisationId) return
  const sb = supabaseService()
  await sb
    .from('organisations')
    .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq('id', organisationId)
}

type InvoiceObj = {
  customer?: string
  status?: string
  hosted_invoice_url?: string
}

async function handleInvoicePaymentFailed(event: StripeEvent): Promise<void> {
  const invoice = event.data.object as InvoiceObj
  const customerId = asString(invoice.customer)
  if (!customerId) return
  const sb = supabaseService()
  await sb
    .from('organisations')
    .update({ plan_status: 'past_due', updated_at: new Date().toISOString() })
    .eq('stripe_customer_id', customerId)
}

async function handleInvoicePaymentSucceeded(event: StripeEvent): Promise<void> {
  const invoice = event.data.object as InvoiceObj
  const customerId = asString(invoice.customer)
  if (!customerId) return
  const sb = supabaseService()
  // Restore to active only when org is currently past_due. Don't clobber
  // a trialing org back into active prematurely.
  await sb
    .from('organisations')
    .update({ plan_status: 'active', updated_at: new Date().toISOString() })
    .eq('stripe_customer_id', customerId)
    .eq('plan_status', 'past_due')
}

// Resolve the org id for the incoming event so the idempotency row
// can be tenant-scoped at insert time. Falls back to null if the
// event isn't attributable yet — the page filter excludes nulls so
// no cross-tenant leak.
async function resolveOrgIdForEvent(event: StripeEvent): Promise<string | null> {
  const obj = event.data.object as Record<string, unknown>
  // 1. metadata.organisation_id (subscription / customer / etc.)
  const meta = obj['metadata']
  if (meta && typeof meta === 'object') {
    const orgId = (meta as Record<string, unknown>)['organisation_id']
    if (
      typeof orgId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)
    ) {
      return orgId
    }
  }
  // 2. customer / customer_id → lookup organisations.stripe_customer_id
  const customerId = asString(obj['customer']) ?? asString(obj['id'])
  if (customerId) {
    const sb = supabaseService()
    const { data } = await sb
      .from('organisations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle<{ id: string }>()
    if (data) return data.id
  }
  return null
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'Stripe webhook secret not configured' },
      { status: 503 },
    )
  }
  const rawBody = await req.text()
  const sigHeader = req.headers.get('stripe-signature')
  const verify = verifyStripeSignature({
    rawBody,
    signatureHeader: sigHeader,
    secret: env.STRIPE_WEBHOOK_SECRET,
  })
  if (!verify.ok) {
    return NextResponse.json(
      { ok: false, error: `signature ${verify.reason}` },
      { status: 400 },
    )
  }

  let rawEvent: unknown
  try {
    rawEvent = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }
  const parsed = StripeEventEnvelope.safeParse(rawEvent)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'malformed event' }, { status: 400 })
  }
  const event: StripeEvent = parsed.data

  const sb = supabaseService()

  // Resolve the tenant before the idempotency insert so /admin/webhook-
  // events (which RLS-scopes by organisation_id) only ever shows the
  // caller's events. Resolution is best-effort — nullable column on
  // the row, page filter excludes nulls.
  const resolvedOrgId = await resolveOrgIdForEvent(event)

  // Idempotency: insert the event row first; if event_id already
  // exists, this 23505s and we return 200 without doing the work.
  const { error: idemErr } = await sb.from('webhook_events').insert({
    provider: 'stripe',
    event_id: event.id,
    event_type: event.type,
    organisation_id: resolvedOrgId,
    payload: event,
  })
  if (idemErr) {
    if (idemErr.code === '23505') {
      return NextResponse.json({ ok: true, replayed: true })
    }
    // eslint-disable-next-line no-console
    console.error('stripe webhook: idempotency insert failed', idemErr)
    return NextResponse.json({ ok: false, error: idemErr.message }, { status: 500 })
  }

  try {
    switch (event.type) {
      case 'customer.created':
        await handleCustomerCreated(event)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event)
        break
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event)
        break
      default:
        // Unknown event types: still recorded in webhook_events, just
        // not acted on.
        break
    }

    await sb
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', event.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    await sb
      .from('webhook_events')
      .update({ error: message })
      .eq('event_id', event.id)
    // eslint-disable-next-line no-console
    console.error('stripe webhook: handler error', { type: event.type, err })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
