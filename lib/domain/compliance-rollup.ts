// lib/domain/compliance-rollup.ts
// Property/portfolio-level rollups + "what's coming up next" picker.
// Pure functions; complianceStatus stays in lib/domain/compliance.ts.

import { complianceStatus, type ComplianceStatus } from './compliance'

export type ComplianceItemLike = {
  id: string
  kind: string
  expiryDate: Date | string | null
  status?: string // when stored 'exempt' wins over derived; otherwise derive
}

export type ComplianceRollup = {
  total: number
  valid: number
  expiring: number
  expired: number
  missing: number
  exempt: number
}

const EMPTY: ComplianceRollup = {
  total: 0,
  valid: 0,
  expiring: 0,
  expired: 0,
  missing: 0,
  exempt: 0,
}

function effectiveStatus(
  item: ComplianceItemLike,
  now: Date,
): ComplianceStatus | 'exempt' {
  if (item.status === 'exempt') return 'exempt'
  return complianceStatus(item.expiryDate, now)
}

export function complianceRollup(
  items: ComplianceItemLike[],
  now: Date = new Date(),
): ComplianceRollup {
  if (items.length === 0) return { ...EMPTY }
  const out = { ...EMPTY, total: items.length }
  for (const item of items) {
    const s = effectiveStatus(item, now)
    out[s] += 1
  }
  return out
}

// "What's next to deal with?" — finds the soonest expiring or already-expired
// item across the input. Skips items that are exempt or have no expiry.
// Returns null if nothing has an expiry.
export function nextExpiringItem<T extends ComplianceItemLike>(
  items: T[],
  _now: Date = new Date(),
): T | null {
  const candidates = items.filter((i) => {
    if (i.status === 'exempt') return false
    if (!i.expiryDate) return false
    return true
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const da = a.expiryDate instanceof Date ? a.expiryDate : new Date(a.expiryDate ?? 0)
    const db = b.expiryDate instanceof Date ? b.expiryDate : new Date(b.expiryDate ?? 0)
    return da.getTime() - db.getTime()
  })
  return candidates[0] ?? null
}

// Property-level convenience: returns the "attention required" count —
// anything that isn't valid or exempt. Used as a dashboard tile + property
// list column.
export function attentionCount(
  items: ComplianceItemLike[],
  now: Date = new Date(),
): number {
  const r = complianceRollup(items, now)
  return r.expiring + r.expired + r.missing
}
