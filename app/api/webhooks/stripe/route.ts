// app/api/webhooks/stripe/route.ts
//
// Stripe webhook handler. Allowed-path for service role (app/api/
// webhooks/* per the convention). Verifies signature, inserts the
// raw event into webhook_events for idempotency, then handles
// subscription / customer / invoice lifecycle events.

import 'server-only'
import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db/admin'
import { env } from '@/env'
import { verifyStripeSignature } from '@/lib/stripe/webhook-signature'

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

// Map Stripe price id → our plan enum. The PLAN_BY_PRICE map is built
// at request time so env changes don't require a restart.
function planFromPriceId(priceId: string | null): string {
  if (!priceId) return 'free'
  if (priceId === env.STRIPE_PRICE_STARTER_MONTHLY) return 'starter'
  if (priceId === env.STRIPE_PRICE_GROWTH_MONTHLY) return 'growth'
  if (priceId === env.STRIPE_PRICE_PRO_MONTHLY) return 'pro'
  return 'free'
}

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

  // Mirror status onto the organisation. The org check constraint now
  // accepts all eight Stripe statuses (see 20260515000015_m12_security_
  // fixes) so we pass them through directly — EXCEPT in two cases:
  //   1. On subscription.deleted, drop to 'active' so a cancelled
  //      subscription doesn't leave the org gated by the can-helpers'
  //      past-due short-circuit. The plan goes to 'free'; the user
  //      stays usable on the free tier.
  //   2. For `incomplete` / `incomplete_expired` / `unpaid` map to
  //      `past_due` for can-helper purposes — these are all payment-
  //      failure-shaped states.
  let orgPlanStatus: string
  if (event.type === 'customer.subscription.deleted') {
    orgPlanStatus = 'active'
  } else if (['incomplete', 'incomplete_expired', 'unpaid'].includes(status)) {
    orgPlanStatus = 'past_due'
  } else {
    orgPlanStatus = status
  }
  const plan = event.type === 'customer.subscription.deleted' ? 'free' : planFromPriceId(priceId)
  await sb
    .from('organisations')
    .update({
      plan,
      plan_status: orgPlanStatus,
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

  let event: StripeEvent
  try {
    event = JSON.parse(rawBody) as StripeEvent
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }
  if (!event.id || !event.type) {
    return NextResponse.json({ ok: false, error: 'malformed event' }, { status: 400 })
  }

  const sb = supabaseService()

  // Idempotency: insert the event row first; if event_id already
  // exists, this 23505s and we return 200 without doing the work.
  const { error: idemErr } = await sb.from('webhook_events').insert({
    provider: 'stripe',
    event_id: event.id,
    event_type: event.type,
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
