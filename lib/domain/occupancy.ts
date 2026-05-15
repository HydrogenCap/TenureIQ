// lib/domain/occupancy.ts
// Per-property occupancy + void-period helpers. Pure functions.

export type UnitStatus = 'occupied' | 'vacant' | 'reserved' | 'maintenance' | 'offline'

// Occupancy in basis points: (occupied / total) × 10000.
// Returns 0 if total is 0 (no units = nothing to be occupied).
export function occupancyBps(
  units: Array<{ status: UnitStatus }>,
): number {
  if (units.length === 0) return 0
  const occupied = units.filter((u) => u.status === 'occupied').length
  return Math.round((occupied * 10000) / units.length)
}

// Calendar days between a tenancy ending and the next one starting.
// Returns 0 if either date is missing (no completed void window).
export function voidDays(
  tenancyEndedAt: Date | string | null | undefined,
  nextTenancyStartedAt: Date | string | null | undefined,
): number {
  if (!tenancyEndedAt || !nextTenancyStartedAt) return 0
  const end = tenancyEndedAt instanceof Date ? tenancyEndedAt : new Date(tenancyEndedAt)
  const start =
    nextTenancyStartedAt instanceof Date
      ? nextTenancyStartedAt
      : new Date(nextTenancyStartedAt)
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return 0
  const days = Math.floor((start.getTime() - end.getTime()) / 86_400_000)
  return Math.max(0, days)
}

// "Currently active" picks: not soft-deleted, status active or notice_given,
// and end_date is null or in the future (relative to `today`).
type TenancyLike = {
  id: string
  status: string
  endDate: Date | string | null
  startDate: Date | string
  deletedAt?: Date | string | null
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

export function currentTenancy<T extends TenancyLike>(
  tenancies: T[],
  today: Date = new Date(),
): T | null {
  const live = tenancies.filter((t) => {
    if (t.deletedAt) return false
    if (t.status === 'ended' || t.status === 'cancelled' || t.status === 'terminated') return false
    if (t.endDate && toDate(t.endDate) < today) return false
    if (toDate(t.startDate) > today) return false
    return true
  })
  if (live.length === 0) return null
  // If multiple match, take the most-recently-started (covers re-lets that
  // begin same-day; tie-break by id for determinism).
  live.sort((a, b) => {
    const diff = toDate(b.startDate).getTime() - toDate(a.startDate).getTime()
    if (diff !== 0) return diff
    return a.id.localeCompare(b.id)
  })
  return live[0] ?? null
}
