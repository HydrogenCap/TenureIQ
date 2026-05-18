// app/(app)/settings/billing/actions.ts
//
// Billing actions — owner-only. createCheckoutSession + createPortalSession
// delegate to lib/stripe/client.ts (which lives in the service-role
// allowed path).

'use server'

import { z } from 'zod'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { env } from '@/env'
import {
  createCheckoutSession as stripeCreateCheckout,
  createPortalSession as stripeCreatePortal,
} from '@/lib/stripe/client'
import { PLANS, type PlanId } from '@/lib/billing/plans'
import type { ActionResult } from '@/lib/types/action-result'

const CheckoutInput = z.object({
  targetPlan: z.enum(['starter', 'growth', 'pro']),
})

export async function createCheckoutSession(
  input: unknown,
): Promise<ActionResult<{ url: string }>> {
  // Billing is owner-only — even admins can't change the plan.
  const auth = await requireOrgRole(['owner'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = CheckoutInput.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const plan: PlanId = parsed.data.targetPlan
  const priceEnvKey = PLANS[plan].stripePriceIdEnvKey
  if (!priceEnvKey) {
    return { ok: false, error: 'This plan is not available for self-serve checkout.' }
  }
  const priceId = process.env[priceEnvKey]
  if (!priceId) {
    return {
      ok: false,
      error: `Stripe price id not configured (env ${priceEnvKey}).`,
    }
  }

  // Fetch the org to pre-fill customer (or pass email if first time).
  const sb = await supabaseServer()
  const { data: org } = await sb
    .from('organisations')
    .select('stripe_customer_id, slug')
    .eq('id', auth.organisationId)
    .maybeSingle<{ stripe_customer_id: string | null; slug: string }>()

  // Owner email — read from auth.users via the auth client.
  const { data: { user } } = await sb.auth.getUser()
  const email = user?.email ?? null

  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const result = await stripeCreateCheckout({
    customerId: org?.stripe_customer_id ?? null,
    customerEmail: email,
    organisationId: auth.organisationId,
    priceId,
    successUrl: `${baseUrl}/settings/billing?status=success`,
    cancelUrl: `${baseUrl}/settings/billing?status=cancel`,
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: { url: result.url } }
}

export async function createPortalSession(): Promise<ActionResult<{ url: string }>> {
  const auth = await requireOrgRole(['owner'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const sb = await supabaseServer()
  const { data: org } = await sb
    .from('organisations')
    .select('stripe_customer_id')
    .eq('id', auth.organisationId)
    .maybeSingle<{ stripe_customer_id: string | null }>()
  if (!org?.stripe_customer_id) {
    return {
      ok: false,
      error: 'No Stripe customer linked yet. Complete a Checkout first.',
    }
  }
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const result = await stripeCreatePortal({
    customerId: org.stripe_customer_id,
    returnUrl: `${baseUrl}/settings/billing`,
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: { url: result.url } }
}
