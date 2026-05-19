// lib/stripe/derive-org-plan-state.ts
// Pure mapping from Stripe subscription state → TenureIQ
// (org.plan, org.plan_status). Lives separately from the webhook
// handler so the branching can be unit-tested without mocking
// supabase.
//
// The eight Stripe subscription statuses we receive are:
//   trialing, active, past_due, canceled, unpaid, incomplete,
//   incomplete_expired, paused
//
// Plan stays whatever the priceId maps to UNLESS the event is
// subscription.deleted, in which case the org drops to free.
//
// plan_status mostly mirrors the Stripe status, with two exceptions:
//   - incomplete / incomplete_expired / unpaid map to 'past_due' so
//     the lib/billing/can.ts past-due short-circuit gates mutations
//     uniformly.
//   - subscription.deleted forces 'active' (not 'canceled') so the
//     past-due short-circuit doesn't gate the user out of the free
//     tier they're now on.

export type SubscriptionChangeEventType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'

export type PlanId = 'free' | 'starter' | 'growth' | 'pro' | 'enterprise'

export type DerivedOrgPlanState = {
  plan: PlanId
  planStatus: string
}

export type PriceIdMap = {
  starter: string | null | undefined
  growth: string | null | undefined
  pro: string | null | undefined
}

export function planFromPriceId(priceId: string | null, map: PriceIdMap): PlanId {
  if (!priceId) return 'free'
  if (map.starter && priceId === map.starter) return 'starter'
  if (map.growth && priceId === map.growth) return 'growth'
  if (map.pro && priceId === map.pro) return 'pro'
  return 'free'
}

const PAYMENT_FAILURE_STATUSES = new Set([
  'incomplete',
  'incomplete_expired',
  'unpaid',
])

export function deriveOrgPlanState(input: {
  eventType: SubscriptionChangeEventType
  subscriptionStatus: string
  priceId: string | null
  priceIdMap: PriceIdMap
}): DerivedOrgPlanState {
  const plan =
    input.eventType === 'customer.subscription.deleted'
      ? 'free'
      : planFromPriceId(input.priceId, input.priceIdMap)

  let planStatus: string
  if (input.eventType === 'customer.subscription.deleted') {
    planStatus = 'active'
  } else if (PAYMENT_FAILURE_STATUSES.has(input.subscriptionStatus)) {
    planStatus = 'past_due'
  } else {
    planStatus = input.subscriptionStatus
  }

  return { plan, planStatus }
}
