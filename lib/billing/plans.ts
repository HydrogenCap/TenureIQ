// lib/billing/plans.ts
// Single source of truth for plan limits and feature gates. The
// settings page renders this; the can-helpers read this; tests
// import this. NEVER inline a plan limit anywhere else.

export type PlanFeatures = {
  aasc: boolean
  reports: boolean
  investors: boolean
}

export type PlanLimits = {
  label: string
  // null = unlimited (enterprise).
  maxProperties: number | null
  maxDocuments: number | null
  maxOcrPerMonth: number | null
  features: PlanFeatures
  // Pence per month — null for free / enterprise (not self-serve).
  monthlyPricePence: bigint | null
  // Public price ID — populated when Stripe products are wired.
  // Reads from env at action time; this map is just the lookup.
  stripePriceIdEnvKey: string | null
}

export const PLANS = {
  free: {
    label: 'Free',
    maxProperties: 3,
    maxDocuments: 10,
    maxOcrPerMonth: 5,
    features: { aasc: false, reports: false, investors: false },
    monthlyPricePence: null,
    stripePriceIdEnvKey: null,
  },
  starter: {
    label: 'Starter',
    maxProperties: 10,
    maxDocuments: 100,
    maxOcrPerMonth: 50,
    features: { aasc: false, reports: true, investors: false },
    monthlyPricePence: 4900n, // £49
    stripePriceIdEnvKey: 'STRIPE_PRICE_STARTER_MONTHLY',
  },
  growth: {
    label: 'Growth',
    maxProperties: 50,
    maxDocuments: 1000,
    maxOcrPerMonth: 250,
    features: { aasc: true, reports: true, investors: false },
    monthlyPricePence: 14900n, // £149
    stripePriceIdEnvKey: 'STRIPE_PRICE_GROWTH_MONTHLY',
  },
  pro: {
    label: 'Pro',
    maxProperties: 250,
    maxDocuments: 10000,
    maxOcrPerMonth: 2000,
    features: { aasc: true, reports: true, investors: true },
    monthlyPricePence: 39900n, // £399
    stripePriceIdEnvKey: 'STRIPE_PRICE_PRO_MONTHLY',
  },
  enterprise: {
    label: 'Enterprise',
    maxProperties: null,
    maxDocuments: null,
    maxOcrPerMonth: null,
    features: { aasc: true, reports: true, investors: true },
    monthlyPricePence: null,
    stripePriceIdEnvKey: null,
  },
} as const satisfies Record<string, PlanLimits>

export type PlanId = keyof typeof PLANS

export function isPlanId(s: string): s is PlanId {
  return s in PLANS
}

export function getPlanLimits(plan: string): PlanLimits {
  return isPlanId(plan) ? PLANS[plan] : PLANS.free
}

// Order is the "upgrade path" — used by the can-helpers to suggest
// the lowest plan that satisfies a request.
export const UPGRADE_ORDER: PlanId[] = [
  'free',
  'starter',
  'growth',
  'pro',
  'enterprise',
]

export function nextPlanCovering(
  predicate: (limits: PlanLimits) => boolean,
  from: PlanId = 'free',
): PlanId | null {
  const fromIdx = UPGRADE_ORDER.indexOf(from)
  for (let i = Math.max(0, fromIdx); i < UPGRADE_ORDER.length; i++) {
    const id = UPGRADE_ORDER[i]
    if (id === undefined) continue
    if (predicate(PLANS[id])) return id
  }
  return null
}
