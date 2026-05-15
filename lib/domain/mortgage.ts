// lib/domain/mortgage.ts
// Mortgage-specific pure helpers. Read-only — no I/O. Consumers fetch
// the mortgage + events and pass them in.

export type MortgageEventKind =
  | 'drawdown'
  | 'payment'
  | 'payment_interest_only'
  | 'rate_change'
  | 'product_switch'
  | 'redemption'
  | 'er_charge'
  | 'reconciliation'

export type MortgageEventLike = {
  eventDate: Date | string
  kind: string
  ratePostBps: number | null
  amountPence: bigint | null
  balancePence: bigint | null
}

export type MortgageLike = {
  interestRateBps: number
  fixedEndDate: Date | string | null
  currentBalancePence: bigint
  isInterestOnly: boolean
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

// Returns the effective rate as of `asOf` (default: now). Reads the
// most recent rate_change or product_switch event up to that date; falls
// back to mortgage.interestRateBps if none.
export function currentInterestRateBps(
  mortgage: MortgageLike,
  events: MortgageEventLike[],
  asOf: Date = new Date(),
): number {
  const rateEvents = events
    .filter((e) => e.kind === 'rate_change' || e.kind === 'product_switch')
    .filter((e) => e.ratePostBps !== null)
    .filter((e) => toDate(e.eventDate) <= asOf)
    .sort((a, b) => toDate(b.eventDate).getTime() - toDate(a.eventDate).getTime())

  return rateEvents[0]?.ratePostBps ?? mortgage.interestRateBps
}

// Monthly interest: balance × rate ÷ (10_000 × 12). Pure bigint.
// (Convention: divide before final multiplication to avoid intermediate
// overflow on large portfolios — though bigint is unbounded, integer
// division order affects rounding. We use the order the lender quotes.)
export function monthlyInterestPence(balancePence: bigint, rateBps: number): bigint {
  if (rateBps <= 0) return 0n
  return (balancePence * BigInt(rateBps)) / 120_000n
}

// Months from `from` until `to`. Negative if `to` is in the past.
export function monthsUntil(to: Date | string, from: Date = new Date()): number {
  const toD = toDate(to)
  const months =
    (toD.getFullYear() - from.getFullYear()) * 12 + (toD.getMonth() - from.getMonth())
  // Adjust by a fraction-of-month if the day-of-month hasn't arrived yet.
  return toD.getDate() < from.getDate() ? months - 1 : months
}

export function daysUntilFixedEnd(
  mortgage: MortgageLike,
  from: Date = new Date(),
): number | null {
  if (!mortgage.fixedEndDate) return null
  const end = toDate(mortgage.fixedEndDate)
  return Math.floor((end.getTime() - from.getTime()) / 86_400_000)
}

// Re-derive the current balance from the event ledger. Used by
// recordMortgageEvent on the server. Starts from the most recent
// `drawdown` (or `reconciliation`) event's balance, then applies
// payments going forward.
//
// Convention: a 'payment' decrements balance by amountPence; a
// 'payment_interest_only' does NOT. Rate changes don't move balance.
export function deriveBalancePence(
  initialBalancePence: bigint,
  events: MortgageEventLike[],
): bigint {
  // Find the latest reconciliation/drawdown row that carries an
  // explicit balance — use it as the starting point.
  const sorted = events
    .slice()
    .sort((a, b) => toDate(a.eventDate).getTime() - toDate(b.eventDate).getTime())

  let balance = initialBalancePence
  let baselineDate: Date | null = null

  for (const e of sorted) {
    if ((e.kind === 'drawdown' || e.kind === 'reconciliation') && e.balancePence !== null) {
      balance = e.balancePence
      baselineDate = toDate(e.eventDate)
    }
  }

  // Apply payments after the baseline.
  for (const e of sorted) {
    const eventDate = toDate(e.eventDate)
    if (baselineDate && eventDate <= baselineDate) continue
    if (e.kind === 'payment' && e.amountPence !== null) {
      balance = balance - e.amountPence
    } else if (e.kind === 'redemption' && e.amountPence !== null) {
      balance = balance - e.amountPence
    }
    // payment_interest_only, rate_change, product_switch, er_charge: don't move balance
  }

  return balance < 0n ? 0n : balance
}
