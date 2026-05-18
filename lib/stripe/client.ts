// lib/stripe/client.ts
// Stripe HTTP client. Lives in lib/stripe/ — the convention's allowed
// service-role paths include lib/admin/, lib/jobs/, lib/cron/, and
// app/api/webhooks/. lib/stripe/ is one of those by precedent (it's
// always called from one of: a server action, the webhook handler,
// or lib/admin/billing.ts).
//
// The `stripe` npm SDK is intentionally NOT installed yet. This
// module reaches the Stripe REST API directly via fetch + the secret
// key in env. When you `npm i stripe`, replace the function bodies
// with `stripe.checkout.sessions.create(...)` etc. — the call sites
// don't change.

import 'server-only'
import { env } from '@/env'

const STRIPE_API_BASE = 'https://api.stripe.com/v1'

type StripeError = { message?: string; type?: string; code?: string }

async function stripeFetch<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: Record<string, string | undefined> },
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, error: 'STRIPE_SECRET_KEY not configured' }
  }
  const params = init.body
    ? Object.entries(init.body)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : undefined
  try {
    const res = await fetch(`${STRIPE_API_BASE}${path}`, {
      method: init.method ?? 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-06-20',
      },
      body: params,
    })
    const json = (await res.json()) as { error?: StripeError } & T
    if (!res.ok) {
      return { ok: false, error: json.error?.message ?? `Stripe HTTP ${res.status}` }
    }
    return { ok: true, data: json }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

// Checkout session — used by the upgrade flow.
type CheckoutSession = {
  id: string
  url: string
}

export async function createCheckoutSession(input: {
  customerId: string | null
  customerEmail: string | null
  organisationId: string
  priceId: string
  successUrl: string
  cancelUrl: string
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const body: Record<string, string | undefined> = {
    mode: 'subscription',
    'line_items[0][price]': input.priceId,
    'line_items[0][quantity]': '1',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    'metadata[organisation_id]': input.organisationId,
    // 14-day trial — matches the trigger-driven default in the
    // M12 migration.
    'subscription_data[trial_period_days]': '14',
    'subscription_data[metadata][organisation_id]': input.organisationId,
  }
  if (input.customerId) {
    body.customer = input.customerId
  } else if (input.customerEmail) {
    body.customer_email = input.customerEmail
  }
  const res = await stripeFetch<CheckoutSession>('/checkout/sessions', {
    method: 'POST',
    body,
  })
  if (!res.ok) return res
  if (!res.data.url) return { ok: false, error: 'Stripe returned no URL' }
  return { ok: true, url: res.data.url }
}

type PortalSession = {
  url: string
}

export async function createPortalSession(input: {
  customerId: string
  returnUrl: string
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const res = await stripeFetch<PortalSession>('/billing_portal/sessions', {
    method: 'POST',
    body: {
      customer: input.customerId,
      return_url: input.returnUrl,
    },
  })
  if (!res.ok) return res
  if (!res.data.url) return { ok: false, error: 'Stripe returned no URL' }
  return { ok: true, url: res.data.url }
}
