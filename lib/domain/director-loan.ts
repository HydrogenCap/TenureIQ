// lib/domain/director-loan.ts
// Pure domain helpers for the director-loan ledger.
//
// Sign convention (used everywhere in director_loans):
//   loan_in           = POSITIVE (director puts money INTO the company;
//                                 the company now owes them more)
//   loan_out          = NEGATIVE (director takes money OUT of the company)
//   interest_accrued  = POSITIVE (interest payable to director)
//   repayment         = NEGATIVE (company repays director)
//
// The balance is the simple sum of amount_pence. A positive balance
// means the COMPANY OWES the director (a creditor on the balance sheet).

export type DirectorLoanKind =
  | 'loan_in'
  | 'loan_out'
  | 'interest_accrued'
  | 'repayment'

const REQUIRES_POSITIVE: ReadonlySet<DirectorLoanKind> = new Set([
  'loan_in',
  'interest_accrued',
])
const REQUIRES_NEGATIVE: ReadonlySet<DirectorLoanKind> = new Set([
  'loan_out',
  'repayment',
])

// Sign-convention guard. Caller (server action) consults this BEFORE
// writing to director_loans so a typo'd loan_in with a negative amount
// doesn't quietly invert the ledger.
export function directorLoanSignViolation(
  kind: DirectorLoanKind,
  amountPence: bigint,
): string | null {
  if (amountPence === 0n) {
    return `${kind} amount must be non-zero.`
  }
  if (REQUIRES_POSITIVE.has(kind) && amountPence < 0n) {
    return `${kind} amount must be positive (balance increasing).`
  }
  if (REQUIRES_NEGATIVE.has(kind) && amountPence > 0n) {
    return `${kind} amount must be negative (balance decreasing).`
  }
  return null
}

export type DirectorLoanEvent = {
  eventDate: Date | string
  amountPence: bigint
  deletedAt?: Date | string | null
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

// Sum of signed amounts up to asOf, excluding soft-deleted rows.
// Returns positive when the company owes the director, negative when
// the director is overdrawn (which is a tax red flag — see s455 CTA 2010).
export function directorLoanBalancePence(
  events: ReadonlyArray<DirectorLoanEvent>,
  asOf: Date = new Date(),
): bigint {
  let total = 0n
  for (const e of events) {
    if (e.deletedAt) continue
    if (toDate(e.eventDate) > asOf) continue
    total += e.amountPence
  }
  return total
}

// Per-director balance roll-up. The ledger table stores `director_name`
// inline (not a FK) per the original schema — same director can appear
// on multiple entities.
export type PerDirectorBalance = {
  directorName: string
  balancePence: bigint
  // Whether the balance is currently negative (overdrawn — directors
  // owe the company). Triggers the s455 CTA 2010 warning.
  isOverdrawn: boolean
}

export function directorLoanBalancesByDirector(
  events: ReadonlyArray<DirectorLoanEvent & { directorName: string }>,
  asOf: Date = new Date(),
): PerDirectorBalance[] {
  const sums = new Map<string, bigint>()
  for (const e of events) {
    if (e.deletedAt) continue
    if (toDate(e.eventDate) > asOf) continue
    sums.set(e.directorName, (sums.get(e.directorName) ?? 0n) + e.amountPence)
  }
  const out: PerDirectorBalance[] = []
  for (const [directorName, balancePence] of sums) {
    out.push({ directorName, balancePence, isOverdrawn: balancePence < 0n })
  }
  // Stable: by name, ascending.
  out.sort((a, b) => a.directorName.localeCompare(b.directorName))
  return out
}
