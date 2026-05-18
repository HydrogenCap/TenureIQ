// lib/reports/portfolio-summary/types.ts

export type PortfolioRow = {
  id: string
  addressLine1: string
  postcode: string
  entityName: string
  kind: string
  epcRating: string | null
  // pence
  valuePence: bigint
  debtPence: bigint
  // bps
  ltvBps: number | null
  grossYieldBps: number | null
  // Flags surfaced as a callout strip in the row
  letBlocked: boolean
}

export type PortfolioSummaryData = {
  organisationName: string
  asOf: Date
  rows: PortfolioRow[]
  totals: {
    propertyCount: number
    valuePence: bigint
    debtPence: bigint
    equityPence: bigint
    weightedLtvBps: number | null
  }
  letBlockedCount: number
}
