// lib/domain/investor.ts
// Investor capital-account domain: balance roll-up, accrual helper,
// XIRR (extended internal rate of return), and sign-convention guard
// for ledger writes.
//
// Sign convention (used everywhere in investor_transactions):
//   contributions      = POSITIVE (investor puts money in)
//   distributions      = NEGATIVE (investor takes money out)
//   interest_accrual   = POSITIVE (balance increases)
//   fee                = NEGATIVE (balance decreases)
//   redemption         = NEGATIVE (account closes; balance returns)
//   adjustment         = EITHER (manual correction; sign caller's choice)
//
// `currentBalancePence` is therefore the simple sum of amounts.

export type TxLike = {
  transactionDate: Date | string
  amountPence: bigint
  // Optional: lets the caller exclude rows whose deleted_at != null.
  deletedAt?: Date | string | null
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

// Sign-convention validation. Caller (server action) consults this
// BEFORE writing to investor_transactions so a typo'd contribution
// with a negative amount doesn't corrupt the balance roll-up.
// Returns null if the (kind, amount) pair is consistent, or a short
// reason if it isn't.
export type InvestorTxKindForSignCheck =
  | 'contribution'
  | 'distribution'
  | 'interest_accrual'
  | 'fee'
  | 'redemption'
  | 'adjustment'

const REQUIRES_POSITIVE: ReadonlySet<InvestorTxKindForSignCheck> = new Set([
  'contribution',
  'interest_accrual',
])
const REQUIRES_NEGATIVE: ReadonlySet<InvestorTxKindForSignCheck> = new Set([
  'distribution',
  'fee',
  'redemption',
])

export function investorTxSignViolation(
  kind: InvestorTxKindForSignCheck,
  amountPence: bigint,
): string | null {
  if (amountPence === 0n) {
    return `${kind} amount must be non-zero.`
  }
  if (REQUIRES_POSITIVE.has(kind) && amountPence < 0n) {
    return `${kind} amount must be positive (money entering the account).`
  }
  if (REQUIRES_NEGATIVE.has(kind) && amountPence > 0n) {
    return `${kind} amount must be negative (money leaving the account).`
  }
  // adjustment is the only kind with no sign constraint.
  return null
}

export function currentBalancePence(
  txs: TxLike[],
  asOf: Date = new Date(),
): bigint {
  let bal = 0n
  for (const t of txs) {
    if (t.deletedAt) continue
    if (toDate(t.transactionDate) > asOf) continue
    bal += t.amountPence
  }
  return bal
}

// =========================================================================
// XIRR
// =========================================================================
//
// XIRR is the constant annualised rate r such that
//   Σ ( amount_i / (1 + r) ^ ( (date_i - date_0) / 365 ) ) = 0
//
// Newton-Raphson with a safe bisection fallback. Returns basis points
// (e.g. 750 = 7.5%) or `null` for ambiguous / degenerate cases (no sign
// change between flows; only one flow; sum is already zero with no
// positive/negative split).
//
// Worked examples in lib/domain/investor.test.ts match Excel's XIRR()
// within 1 bps.

type Flow = { date: Date; amountPence: bigint }

function normaliseFlows(input: { date: Date | string; amountPence: bigint }[]): Flow[] {
  return input
    .filter((f) => f.amountPence !== 0n)
    .map((f) => ({
      date: f.date instanceof Date ? f.date : new Date(f.date),
      amountPence: f.amountPence,
    }))
    .filter((f) => !Number.isNaN(f.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

// NPV at rate r, using day-count = (days_since_first) / 365.
function npv(rate: number, flows: Flow[]): number {
  if (flows.length === 0) return 0
  const t0 = flows[0]!.date.getTime()
  let sum = 0
  for (const f of flows) {
    const years = (f.date.getTime() - t0) / (365 * 86_400_000)
    // amount as a number — fine because IRR is rate-of-return, not a
    // dollar figure; precision drift on the magnitude doesn't matter.
    sum += Number(f.amountPence) / Math.pow(1 + rate, years)
  }
  return sum
}

// Derivative of npv with respect to rate — used by Newton iteration.
function dnpv(rate: number, flows: Flow[]): number {
  if (flows.length === 0) return 0
  const t0 = flows[0]!.date.getTime()
  let sum = 0
  for (const f of flows) {
    const years = (f.date.getTime() - t0) / (365 * 86_400_000)
    sum -= years * Number(f.amountPence) / Math.pow(1 + rate, years + 1)
  }
  return sum
}

export function xirrBps(
  input: { date: Date | string; amountPence: bigint }[],
  guess: number = 0.1,
): number | null {
  const flows = normaliseFlows(input)
  if (flows.length < 2) return null

  // Need at least one positive and one negative — otherwise no real
  // root exists.
  let hasPos = false
  let hasNeg = false
  for (const f of flows) {
    if (f.amountPence > 0n) hasPos = true
    else if (f.amountPence < 0n) hasNeg = true
  }
  if (!hasPos || !hasNeg) return null

  // Newton-Raphson, capped at 60 iterations, with safe bounds.
  let rate = guess
  for (let i = 0; i < 60; i++) {
    const value = npv(rate, flows)
    if (Math.abs(value) < 1e-7) {
      return Math.round(rate * 10_000)
    }
    const slope = dnpv(rate, flows)
    if (Math.abs(slope) < 1e-12) break // numerically flat — fall through to bisect.
    const next = rate - value / slope
    // Clamp to keep us in a sensible window — -99% to +1000%.
    const clamped = Math.max(-0.99, Math.min(10, next))
    if (Math.abs(clamped - rate) < 1e-9) {
      return Math.round(clamped * 10_000)
    }
    rate = clamped
  }

  // Bisection fallback over [-0.99, 10] — Newton can oscillate near
  // flat regions or with awkward cashflow shapes.
  let lo = -0.99
  let hi = 10
  const nLo = npv(lo, flows)
  const nHi = npv(hi, flows)
  if (Number.isNaN(nLo) || Number.isNaN(nHi)) return null
  if (nLo * nHi > 0) return null // no root in the window
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    const nMid = npv(mid, flows)
    if (Math.abs(nMid) < 1e-7 || (hi - lo) < 1e-9) {
      return Math.round(mid * 10_000)
    }
    if (nLo * nMid < 0) hi = mid
    else lo = mid
  }
  return null
}

// =========================================================================
// Preferred-return helper
// =========================================================================

// Naïve pending-pref accrual: applies a simple-interest-style pro-rata
// of the preferred_return_bps against the *outstanding contributed
// capital* over the elapsed period. Real waterfalls are far more
// complex; this is enough for "what's been earned but not paid?" on
// the quarterly statement.
//
// Returns 0n if the account isn't a preferred-equity or has no pref
// terms — caller decides if "0" should be hidden or shown.
export function pendingPreferredReturnPence(input: {
  contributedToDatePence: bigint
  preferredReturnBps: number
  // Days since the last paid pref (or since the account opened).
  daysAccruing: number
}): bigint {
  if (input.preferredReturnBps <= 0 || input.daysAccruing <= 0) return 0n
  // contributed * (bps / 10000) * (days / 365)
  // Done in two integer multiplications to avoid float drift:
  //   numerator   = contributed * bps * days
  //   denominator = 10_000 * 365
  const numerator =
    input.contributedToDatePence *
    BigInt(input.preferredReturnBps) *
    BigInt(input.daysAccruing)
  return numerator / (10_000n * 365n)
}

// Convenience: contributions only (positive flows) — used for the pref
// base above.
export function contributionsToDatePence(
  txs: TxLike[],
  asOf: Date = new Date(),
): bigint {
  let sum = 0n
  for (const t of txs) {
    if (t.deletedAt) continue
    if (toDate(t.transactionDate) > asOf) continue
    if (t.amountPence > 0n) sum += t.amountPence
  }
  return sum
}

// Distributions paid (the absolute value of negative flows).
export function distributionsToDatePence(
  txs: TxLike[],
  asOf: Date = new Date(),
): bigint {
  let sum = 0n
  for (const t of txs) {
    if (t.deletedAt) continue
    if (toDate(t.transactionDate) > asOf) continue
    if (t.amountPence < 0n) sum += -t.amountPence
  }
  return sum
}
