// lib/domain/transactions.ts
// Pure aggregators for the transaction ledger. No I/O — callers fetch
// rows and pass them in.
//
// `amountPence` convention: positive = credit (money in), negative =
// debit (money out). Sums therefore give net cashflow naturally.
//
// Split parents are excluded from totals (the children carry the
// amounts); pass `kind: 'split'` rows in if you want them visible in
// the row list but want them to not contribute to the sum.

export const TRANSACTION_CATEGORIES = [
  // Credits
  'rent',
  'deposit_received',
  'aasc_payment',
  'insurance_payout',
  'investor_contribution',
  'director_loan_in',
  'refinance_drawdown',
  'other_income',
  // Debits
  'mortgage_payment',
  'mortgage_interest',
  'mortgage_capital',
  'maintenance',
  'repairs',
  'insurance_premium',
  'agent_fees',
  'utilities',
  'council_tax',
  'ground_rent',
  'service_charge',
  'compliance',
  'cleaning',
  'professional_fees',
  'travel',
  'subscriptions',
  'tax_payment',
  'investor_distribution',
  'director_loan_out',
  'capital_expenditure',
  'other_expense',
  // Neutral / structural
  'transfer',
  'reconciliation',
  'opening_balance',
  'uncategorised',
] as const

export type CategoryCode = (typeof TRANSACTION_CATEGORIES)[number]

// Categories that count as credit (money in) for P&L purposes.
export const CREDIT_CATEGORIES: ReadonlySet<CategoryCode> = new Set<CategoryCode>([
  'rent',
  'deposit_received',
  'aasc_payment',
  'insurance_payout',
  'investor_contribution',
  'director_loan_in',
  'refinance_drawdown',
  'other_income',
])

export type TransactionLike = {
  postedAt: Date | string
  amountPence: bigint
  categoryCode: string
  propertyId?: string | null
  entityId?: string | null
  isSplitParent?: boolean
}

export type PandL = {
  creditsPence: bigint
  debitsPence: bigint
  netPence: bigint
  byCategory: Partial<Record<CategoryCode, bigint>>
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

function aggregate(rows: TransactionLike[]): PandL {
  let credits = 0n
  let debits = 0n
  const byCategory: Partial<Record<CategoryCode, bigint>> = {}

  for (const t of rows) {
    if (t.isSplitParent) continue // children carry the amounts
    if (t.amountPence > 0n) credits += t.amountPence
    else debits += t.amountPence

    const key = t.categoryCode as CategoryCode
    byCategory[key] = (byCategory[key] ?? 0n) + t.amountPence
  }

  return { creditsPence: credits, debitsPence: debits, netPence: credits + debits, byCategory }
}

export type MonthlyPandLInput = {
  transactions: TransactionLike[]
  month: { year: number; month: number } // month is 1-12
  propertyId?: string
  entityId?: string
}

export function monthlyPandL(input: MonthlyPandLInput): PandL {
  const filtered = input.transactions.filter((t) => {
    const d = toDate(t.postedAt)
    if (d.getUTCFullYear() !== input.month.year) return false
    if (d.getUTCMonth() + 1 !== input.month.month) return false
    if (input.propertyId !== undefined && t.propertyId !== input.propertyId) return false
    if (input.entityId !== undefined && t.entityId !== input.entityId) return false
    return true
  })
  return aggregate(filtered)
}

export type AnnualPandLInput = {
  transactions: TransactionLike[]
  year: number
  propertyId?: string
  entityId?: string
}

export function annualPandL(input: AnnualPandLInput): PandL {
  const filtered = input.transactions.filter((t) => {
    const d = toDate(t.postedAt)
    if (d.getUTCFullYear() !== input.year) return false
    if (input.propertyId !== undefined && t.propertyId !== input.propertyId) return false
    if (input.entityId !== undefined && t.entityId !== input.entityId) return false
    return true
  })
  return aggregate(filtered)
}

// Returns 12 monthly P&Ls for the calendar year ending at `endMonth`
// (inclusive). Used for the "last 12 months" chart.
export type Last12Input = {
  transactions: TransactionLike[]
  endMonth: { year: number; month: number }
  propertyId?: string
  entityId?: string
}

export function last12Months(input: Last12Input): Array<PandL & { year: number; month: number }> {
  const out: Array<PandL & { year: number; month: number }> = []
  let { year, month } = input.endMonth
  // Walk backwards 12 entries, then reverse so we return oldest-first.
  for (let i = 0; i < 12; i++) {
    out.push({
      year,
      month,
      ...monthlyPandL({
        transactions: input.transactions,
        month: { year, month },
        propertyId: input.propertyId,
        entityId: input.entityId,
      }),
    })
    month--
    if (month === 0) {
      month = 12
      year--
    }
  }
  return out.reverse()
}

// Category-rule matching for auto-categorisation on import.
// A rule's `pattern` is a substring or regex (when starts with /…/). The
// first matching rule wins. Returns null if nothing matched.
export type CategoryRule = {
  pattern: string
  isRegex: boolean
  categoryCode: string
  propertyId: string | null
  // Optional: only apply when amount sign matches.
  signRequired: 'credit' | 'debit' | null
}

export function categoriseAgainstRules(
  description: string,
  amountPence: bigint,
  rules: CategoryRule[],
): { categoryCode: string; propertyId: string | null } | null {
  const sign: 'credit' | 'debit' = amountPence > 0n ? 'credit' : 'debit'
  for (const rule of rules) {
    if (rule.signRequired !== null && rule.signRequired !== sign) continue
    const matches = rule.isRegex
      ? safeRegexTest(rule.pattern, description)
      : description.toLowerCase().includes(rule.pattern.toLowerCase())
    if (matches) {
      return { categoryCode: rule.categoryCode, propertyId: rule.propertyId }
    }
  }
  return null
}

function safeRegexTest(pattern: string, input: string): boolean {
  try {
    // Pattern format: /body/flags or just body.
    const m = pattern.match(/^\/(.+)\/([gimsuy]*)$/)
    const re = m ? new RegExp(m[1] ?? '', m[2] ?? '') : new RegExp(pattern)
    return re.test(input)
  } catch {
    return false
  }
}
