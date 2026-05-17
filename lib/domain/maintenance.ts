// lib/domain/maintenance.ts
// SLA matrix, ageing, and per-property spend rollups.

export type JobPriority = 'emergency' | 'urgent' | 'normal' | 'low'

export type JobLike = {
  priority: JobPriority
  status: string
  reportedAt: Date | string
  completedAt: Date | string | null
}

// SLA matrix — defines "how long is acceptable before a breach". Tuned
// to the kinds of expectations a residential landlord can defend in a
// disputes process:
//
//   emergency — 24h.   gas leak, no heat in winter, no hot water in HMO.
//   urgent    — 5 days. major appliance failure, security (door/lock).
//   normal    — 21 days. cosmetic, minor faults, planned maintenance.
//   low       — 90 days. nice-to-have, gardening, paintwork.
//
// These line up with most council-disrepair thresholds in 2024.
const SLA_HOURS: Record<JobPriority, number> = {
  emergency: 24,
  urgent: 24 * 5,
  normal: 24 * 21,
  low: 24 * 90,
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

export function daysOpen(job: JobLike, now: Date = new Date()): number {
  const end = job.completedAt ? toDate(job.completedAt) : now
  const reported = toDate(job.reportedAt)
  return Math.max(
    0,
    Math.floor((end.getTime() - reported.getTime()) / 86_400_000),
  )
}

// Returns true if the job has been open longer than its SLA window and
// is not already completed/cancelled.
export function slaBreached(job: JobLike, now: Date = new Date()): boolean {
  if (job.status === 'completed' || job.status === 'cancelled') return false
  const reported = toDate(job.reportedAt)
  const ageHours = (now.getTime() - reported.getTime()) / 3_600_000
  return ageHours > SLA_HOURS[job.priority]
}

export function slaWindowHours(priority: JobPriority): number {
  return SLA_HOURS[priority]
}

// Sum invoice totals (amount + vat) for the period. period is inclusive.
export type InvoiceLike = {
  amountPence: bigint
  vatPence: bigint
  invoiceDate: Date | string
  deletedAt?: Date | string | null
}

export function propertyMaintenanceSpendPence(input: {
  invoices: InvoiceLike[]
  period: { from: Date; to: Date }
}): bigint {
  let total = 0n
  for (const inv of input.invoices) {
    if (inv.deletedAt) continue
    const d = toDate(inv.invoiceDate)
    if (d < input.period.from || d > input.period.to) continue
    total += inv.amountPence + inv.vatPence
  }
  return total
}

// Last-12-months helper for the property finance tab tile.
export function last12MonthsSpendPence(
  invoices: InvoiceLike[],
  now: Date = new Date(),
): bigint {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const from = new Date(to)
  from.setUTCMonth(from.getUTCMonth() - 12)
  return propertyMaintenanceSpendPence({ invoices, period: { from, to } })
}
