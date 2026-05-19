import { describe, it, expect } from 'vitest'
import {
  deriveOrgPlanState,
  planFromPriceId,
} from './derive-org-plan-state'

const PRICES = {
  starter: 'price_starter_test',
  growth: 'price_growth_test',
  pro: 'price_pro_test',
}

describe('planFromPriceId', () => {
  it('maps known price ids to their plans', () => {
    expect(planFromPriceId('price_starter_test', PRICES)).toBe('starter')
    expect(planFromPriceId('price_growth_test', PRICES)).toBe('growth')
    expect(planFromPriceId('price_pro_test', PRICES)).toBe('pro')
  })

  it('falls back to free for unknown price ids', () => {
    expect(planFromPriceId('price_xyz', PRICES)).toBe('free')
  })

  it('falls back to free for null price id', () => {
    expect(planFromPriceId(null, PRICES)).toBe('free')
  })

  it('does not match an env value that is null / undefined', () => {
    // If the env isn't configured, that slot is empty and a passing
    // priceId must not accidentally collide with `=== null`.
    const empty = { starter: null, growth: undefined, pro: 'price_pro_test' }
    expect(planFromPriceId('price_anything', empty)).toBe('free')
    expect(planFromPriceId('price_pro_test', empty)).toBe('pro')
  })
})

describe('deriveOrgPlanState — plan resolution', () => {
  it('uses planFromPriceId for create / update events', () => {
    const r = deriveOrgPlanState({
      eventType: 'customer.subscription.created',
      subscriptionStatus: 'active',
      priceId: 'price_growth_test',
      priceIdMap: PRICES,
    })
    expect(r.plan).toBe('growth')
  })

  it('forces plan=free on subscription.deleted regardless of priceId', () => {
    const r = deriveOrgPlanState({
      eventType: 'customer.subscription.deleted',
      subscriptionStatus: 'canceled',
      priceId: 'price_pro_test',
      priceIdMap: PRICES,
    })
    expect(r.plan).toBe('free')
  })
})

describe('deriveOrgPlanState — plan_status normalisation', () => {
  it('passes happy-path Stripe statuses through unchanged', () => {
    for (const status of ['active', 'trialing', 'past_due', 'paused', 'canceled']) {
      const r = deriveOrgPlanState({
        eventType: 'customer.subscription.updated',
        subscriptionStatus: status,
        priceId: 'price_pro_test',
        priceIdMap: PRICES,
      })
      expect(r.planStatus).toBe(status)
    }
  })

  it('maps payment-failure statuses to past_due', () => {
    for (const status of ['incomplete', 'incomplete_expired', 'unpaid']) {
      const r = deriveOrgPlanState({
        eventType: 'customer.subscription.updated',
        subscriptionStatus: status,
        priceId: 'price_pro_test',
        priceIdMap: PRICES,
      })
      expect(r.planStatus).toBe('past_due')
    }
  })

  it('forces planStatus=active on subscription.deleted (drops to free tier)', () => {
    const r = deriveOrgPlanState({
      eventType: 'customer.subscription.deleted',
      subscriptionStatus: 'canceled',
      priceId: 'price_pro_test',
      priceIdMap: PRICES,
    })
    expect(r.planStatus).toBe('active')
    expect(r.plan).toBe('free')
  })

  it('subscription.deleted overrides even a payment-failure status', () => {
    const r = deriveOrgPlanState({
      eventType: 'customer.subscription.deleted',
      subscriptionStatus: 'unpaid',
      priceId: 'price_pro_test',
      priceIdMap: PRICES,
    })
    expect(r.planStatus).toBe('active')
  })
})

describe('deriveOrgPlanState — common Stripe lifecycle flows', () => {
  it('new starter subscription with trial', () => {
    const r = deriveOrgPlanState({
      eventType: 'customer.subscription.created',
      subscriptionStatus: 'trialing',
      priceId: 'price_starter_test',
      priceIdMap: PRICES,
    })
    expect(r).toEqual({ plan: 'starter', planStatus: 'trialing' })
  })

  it('user upgrades from growth → pro', () => {
    const r = deriveOrgPlanState({
      eventType: 'customer.subscription.updated',
      subscriptionStatus: 'active',
      priceId: 'price_pro_test',
      priceIdMap: PRICES,
    })
    expect(r).toEqual({ plan: 'pro', planStatus: 'active' })
  })

  it('payment fails on a pro subscription', () => {
    const r = deriveOrgPlanState({
      eventType: 'customer.subscription.updated',
      subscriptionStatus: 'past_due',
      priceId: 'price_pro_test',
      priceIdMap: PRICES,
    })
    expect(r).toEqual({ plan: 'pro', planStatus: 'past_due' })
  })

  it('user cancels — drops to free, status active', () => {
    const r = deriveOrgPlanState({
      eventType: 'customer.subscription.deleted',
      subscriptionStatus: 'canceled',
      priceId: 'price_growth_test',
      priceIdMap: PRICES,
    })
    expect(r).toEqual({ plan: 'free', planStatus: 'active' })
  })

  it('unknown / future Stripe status flows through as plan_status', () => {
    // Stripe may add new statuses; we don't want to break the webhook
    // handler — just record the new status verbatim. The org check
    // constraint will reject anything truly invalid.
    const r = deriveOrgPlanState({
      eventType: 'customer.subscription.updated',
      subscriptionStatus: 'novel_future_status',
      priceId: 'price_pro_test',
      priceIdMap: PRICES,
    })
    expect(r.planStatus).toBe('novel_future_status')
  })
})
