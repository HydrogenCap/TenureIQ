// lib/reports/mortgage-book/types.ts

export type MortgageBookRow = {
  id: string
  propertyAddressLine1: string
  propertyPostcode: string
  entityName: string
  lender: string
  product: string
  isInterestOnly: boolean
  // Pence
  currentBalancePence: bigint
  monthlyPaymentPence: bigint
  // bps
  interestRateBps: number
  fixedEndDate: string | null
  daysToFixedEnd: number | null
  ltvBps: number | null
  // Stress scenarios: rate + 1pp, rate + 2pp monthly interest pence.
  stressed1ppMonthlyInterestPence: bigint
  stressed2ppMonthlyInterestPence: bigint
}

export type MortgageBookData = {
  organisationName: string
  asOf: Date
  rows: MortgageBookRow[]
  totals: {
    mortgageCount: number
    currentBalancePence: bigint
    monthlyInterestPence: bigint
    stressed1ppMonthlyInterestPence: bigint
    stressed2ppMonthlyInterestPence: bigint
    weightedAverageRateBps: number | null
  }
  // Mortgages with fixed-end inside 180 days
  refinanceWindowCount: number
}
