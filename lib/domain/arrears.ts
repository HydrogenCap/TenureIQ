// lib/domain/arrears.ts
// Rent-arrears computation. Pure functions, no I/O — callers fetch active
// tenancies + rent-category credit transactions and pass them in.
//
// Granularity is the calendar month: transactions have no tenancy link, so
// arrears is computed PER PROPERTY by comparing rent credits received in a
// month against the monthly-equivalent expectation of the property's active
// tenancies. All money is bigint pence.

import { monthlyRentPence, type RentPeriod } from './rent'

export type ArrearsTenancy = {
  rentPence: bigint
  rentPeriod: RentPeriod
  status: string
  startDate: Date | string
}

// 'YYYY-MM' key for the UTC month containing the date. UTC (not local)
// so the same row groups identically on server and in tests regardless
// of host timezone.
export function monthKey(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// The last `n` month keys ending with the month containing `today`,
// oldest first. The current (partial) month is included because UK rent
// is due in advance — the current month's rent is already expected.
export function lastNMonthKeys(n: number, today: Date | string): string[] {
  const d = today instanceof Date ? today : new Date(today)
  let year = d.getUTCFullYear()
  let month = d.getUTCMonth() + 1
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(`${year}-${String(month).padStart(2, '0')}`)
    month--
    if (month === 0) {
      month = 12
      year--
    }
  }
  return out.reverse()
}

// First month for which we expect a full month of rent: the month AFTER
// the month containing start_date. The partial first month is skipped
// deliberately — the actual first charge depends on the agreement's
// pro-rata terms, which we don't model, and charging a full month would
// generate false arrears the day a tenancy starts. Slightly understates
// expectation in exchange for zero noise.
export function firstChargeableMonth(startDate: Date | string): string {
  const d = startDate instanceof Date ? startDate : new Date(startDate)
  let year = d.getUTCFullYear()
  let month = d.getUTCMonth() + 2 // +1 for 1-based, +1 for "month after"
  if (month === 13) {
    month = 1
    year++
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

// Steady-state monthly expectation: sum of monthly-equivalent rent across
// active tenancies. Used for the "expected / month" display and as the
// flat fallback when no per-month schedule is supplied.
export function expectedMonthlyRentPence(tenancies: ArrearsTenancy[]): bigint {
  let total = 0n
  for (const t of tenancies) {
    if (t.status !== 'active') continue
    total += monthlyRentPence(t.rentPence, t.rentPeriod)
  }
  return total
}

// Expectation for one specific month — only tenancies already past their
// first chargeable month count. 'YYYY-MM' strings compare correctly
// lexicographically, which is why the key format matters.
export function expectedForMonth(tenancies: ArrearsTenancy[], month: string): bigint {
  let total = 0n
  for (const t of tenancies) {
    if (t.status !== 'active') continue
    if (firstChargeableMonth(t.startDate) > month) continue
    total += monthlyRentPence(t.rentPence, t.rentPeriod)
  }
  return total
}

// Per-month expectation schedule across an assessment window. Passing this
// to arrearsForProperty makes mid-window tenancy starts ramp in correctly
// instead of back-charging months before the tenancy existed.
export function expectedByMonth(
  tenancies: ArrearsTenancy[],
  months: string[],
): Map<string, bigint> {
  const out = new Map<string, bigint>()
  for (const m of months) out.set(m, expectedForMonth(tenancies, m))
  return out
}

export type MonthShortfall = {
  month: string
  expectedPence: bigint
  receivedPence: bigint
  // Signed: positive = under-paid that month, negative = over-paid.
  // Carry-forward is NOT applied here — see balancePence for the
  // cumulative, never-negative position.
  shortfallPence: bigint
}

// Values are pence. Bucket = how many whole months older than the newest
// window month the outstanding shortfall's originating month is.
export type AgeingBuckets = {
  current: bigint
  days30: bigint
  days60: bigint
  days90plus: bigint
}

export type ArrearsResult = {
  months: MonthShortfall[]
  // Cumulative outstanding at the end of the window. Never negative:
  // surplus payments become credit, not a negative balance.
  balancePence: bigint
  ageing: AgeingBuckets
}

export type ArrearsInput = {
  expectedMonthlyPence: bigint
  receivedByMonth: { month: string; receivedPence: bigint }[]
  // The assessment window, oldest first (see lastNMonthKeys).
  months: string[]
  // Optional per-month override (see expectedByMonth). Months missing
  // from the map fall back to the flat expectedMonthlyPence.
  expectedByMonthPence?: ReadonlyMap<string, bigint>
}

// Walks the window oldest-first, allocating each month's receipts to the
// OLDEST outstanding month first (FIFO — a catch-up payment clears the
// oldest debt, which is how landlords and courts treat rent receipts).
// Surplus after all debt is cleared carries forward as credit against
// later months, so the cumulative balance can never go negative.
export function arrearsForProperty(input: ArrearsInput): ArrearsResult {
  // Receipts may arrive as multiple rows per month — sum them.
  const receivedMap = new Map<string, bigint>()
  for (const r of input.receivedByMonth) {
    receivedMap.set(r.month, (receivedMap.get(r.month) ?? 0n) + r.receivedPence)
  }

  // FIFO queue of unpaid (or partly paid) months, oldest at the front.
  const outstanding: { month: string; amountPence: bigint }[] = []
  const monthRows: MonthShortfall[] = []
  let creditPence = 0n

  for (const month of input.months) {
    const expected =
      input.expectedByMonthPence?.get(month) ?? input.expectedMonthlyPence
    const received = receivedMap.get(month) ?? 0n

    // Charge this month, then apply this month's cash plus any carried
    // credit to the queue, oldest first.
    if (expected > 0n) outstanding.push({ month, amountPence: expected })
    let available = received + creditPence
    while (available > 0n && outstanding.length > 0) {
      const head = outstanding[0]
      if (head === undefined) break // unreachable; satisfies noUncheckedIndexedAccess
      if (available >= head.amountPence) {
        available -= head.amountPence
        outstanding.shift()
      } else {
        head.amountPence -= available
        available = 0n
      }
    }
    creditPence = available

    monthRows.push({
      month,
      expectedPence: expected,
      receivedPence: received,
      shortfallPence: expected - received,
    })
  }

  let balancePence = 0n
  for (const o of outstanding) balancePence += o.amountPence

  // Bucket by the originating month's distance from the newest window
  // month: 0 months old = current, 1 = days30, 2 = days60, 3+ = days90plus.
  const indexByMonth = new Map(input.months.map((m, i) => [m, i]))
  const newestIndex = input.months.length - 1
  const ageing: AgeingBuckets = { current: 0n, days30: 0n, days60: 0n, days90plus: 0n }
  for (const o of outstanding) {
    const idx = indexByMonth.get(o.month)
    if (idx === undefined) continue // unreachable: queue only holds window months
    const age = newestIndex - idx
    if (age <= 0) ageing.current += o.amountPence
    else if (age === 1) ageing.days30 += o.amountPence
    else if (age === 2) ageing.days60 += o.amountPence
    else ageing.days90plus += o.amountPence
  }

  return { months: monthRows, balancePence, ageing }
}
