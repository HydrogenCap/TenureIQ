// lib/billing/can.ts
// Per-action plan-limit checks. Server-side ONLY — the UI may also
// prompt based on the same info, but every mutating action that
// touches a gated resource must call one of these BEFORE the insert.
//
// The check returns either { ok: true } or
// { ok: false, reason, upgradeTo? } so the caller can render an
// in-context upgrade prompt without re-deriving the plan.

import { supabaseServer } from '@/lib/db/user'
import { getPlanLimits, nextPlanCovering, type PlanId } from './plans'

export type CanResult =
  | { ok: true }
  | {
      ok: false
      reason: 'plan-limit' | 'feature-locked' | 'past-due'
      message: string
      upgradeTo?: PlanId
    }

type OrgRow = {
  plan: string
  plan_status: string
}

async function fetchOrgPlan(organisationId: string): Promise<OrgRow | null> {
  const sb = await supabaseServer()
  const { data } = await sb
    .from('organisations')
    .select('plan, plan_status')
    .eq('id', organisationId)
    .maybeSingle<OrgRow>()
  return data
}

// Read-only orgs go to read-only mode after dunning; mutations are
// blocked everywhere except the billing settings page.
function pastDueIfApplicable(org: OrgRow): CanResult | null {
  if (org.plan_status === 'past_due' || org.plan_status === 'canceled' || org.plan_status === 'paused') {
    return {
      ok: false,
      reason: 'past-due',
      message:
        org.plan_status === 'past_due'
          ? 'Your subscription has past-due payments. Resolve via Settings → Billing to continue.'
          : `Your subscription is ${org.plan_status}. Resolve via Settings → Billing to continue.`,
    }
  }
  return null
}

export async function canCreateProperty(organisationId: string): Promise<CanResult> {
  const org = await fetchOrgPlan(organisationId)
  if (!org) return { ok: false, reason: 'plan-limit', message: 'Organisation not found.' }
  const dunning = pastDueIfApplicable(org)
  if (dunning) return dunning
  const limits = getPlanLimits(org.plan)
  if (limits.maxProperties === null) return { ok: true }

  const sb = await supabaseServer()
  const { count } = await sb
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
  const usedCount = count ?? 0
  if (usedCount < limits.maxProperties) return { ok: true }

  const upgradeTo = nextPlanCovering(
    (p) => p.maxProperties === null || p.maxProperties > usedCount,
    org.plan as PlanId,
  )
  return {
    ok: false,
    reason: 'plan-limit',
    message: `${limits.label} plan is limited to ${limits.maxProperties} properties (you have ${usedCount}). Upgrade to add more.`,
    upgradeTo: upgradeTo ?? undefined,
  }
}

export async function canCreateAascContract(organisationId: string): Promise<CanResult> {
  const org = await fetchOrgPlan(organisationId)
  if (!org) return { ok: false, reason: 'plan-limit', message: 'Organisation not found.' }
  const dunning = pastDueIfApplicable(org)
  if (dunning) return dunning
  const limits = getPlanLimits(org.plan)
  if (limits.features.aasc) return { ok: true }

  const upgradeTo = nextPlanCovering(
    (p) => p.features.aasc,
    org.plan as PlanId,
  )
  return {
    ok: false,
    reason: 'feature-locked',
    message: `AASC tracking is not available on ${limits.label}. Upgrade to Growth or higher.`,
    upgradeTo: upgradeTo ?? undefined,
  }
}

export async function canCreateInvestor(organisationId: string): Promise<CanResult> {
  const org = await fetchOrgPlan(organisationId)
  if (!org) return { ok: false, reason: 'plan-limit', message: 'Organisation not found.' }
  const dunning = pastDueIfApplicable(org)
  if (dunning) return dunning
  const limits = getPlanLimits(org.plan)
  if (limits.features.investors) return { ok: true }

  const upgradeTo = nextPlanCovering(
    (p) => p.features.investors,
    org.plan as PlanId,
  )
  return {
    ok: false,
    reason: 'feature-locked',
    message: `Investor reporting is not available on ${limits.label}. Upgrade to Pro.`,
    upgradeTo: upgradeTo ?? undefined,
  }
}

export async function canRunOcrThisMonth(organisationId: string): Promise<CanResult> {
  const org = await fetchOrgPlan(organisationId)
  if (!org) return { ok: false, reason: 'plan-limit', message: 'Organisation not found.' }
  const dunning = pastDueIfApplicable(org)
  if (dunning) return dunning
  const limits = getPlanLimits(org.plan)
  if (limits.maxOcrPerMonth === null) return { ok: true }

  const sb = await supabaseServer()
  // First of the current calendar month, UTC. (Stripe billing periods
  // would be more accurate but require reading the live subscription —
  // calendar month is a defensible v1 approximation.)
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const { count } = await sb
    .from('usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('metric', 'ocr_runs')
    .gte('at', monthStart)
  const used = count ?? 0
  if (used < limits.maxOcrPerMonth) return { ok: true }
  const upgradeTo = nextPlanCovering(
    (p) => p.maxOcrPerMonth === null || p.maxOcrPerMonth > used,
    org.plan as PlanId,
  )
  return {
    ok: false,
    reason: 'plan-limit',
    message: `${limits.label} plan allows ${limits.maxOcrPerMonth} OCR runs / month. You've used ${used}. Resets on the 1st.`,
    upgradeTo: upgradeTo ?? undefined,
  }
}

export async function canCreateDocument(organisationId: string): Promise<CanResult> {
  const org = await fetchOrgPlan(organisationId)
  if (!org) return { ok: false, reason: 'plan-limit', message: 'Organisation not found.' }
  const dunning = pastDueIfApplicable(org)
  if (dunning) return dunning
  const limits = getPlanLimits(org.plan)
  if (limits.maxDocuments === null) return { ok: true }

  const sb = await supabaseServer()
  const { count } = await sb
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
  const used = count ?? 0
  if (used < limits.maxDocuments) return { ok: true }
  const upgradeTo = nextPlanCovering(
    (p) => p.maxDocuments === null || p.maxDocuments > used,
    org.plan as PlanId,
  )
  return {
    ok: false,
    reason: 'plan-limit',
    message: `${limits.label} plan caps documents at ${limits.maxDocuments}. You have ${used}.`,
    upgradeTo: upgradeTo ?? undefined,
  }
}
