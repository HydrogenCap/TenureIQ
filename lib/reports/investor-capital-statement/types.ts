// lib/reports/investor-capital-statement/types.ts

export type InvestorStatementTx = {
  id: string
  date: string
  kind: string
  amountPence: bigint
  notes: string | null
}

export type InvestorStatementData = {
  organisationName: string
  asOf: Date
  period: { from: Date; to: Date }
  investorName: string
  investorKind: string
  entityName: string
  accountKind: string
  accountStatus: string
  // Headline numbers, all in pence.
  openingBalancePence: bigint
  contributionsPence: bigint
  distributionsPence: bigint
  accrualsPence: bigint
  feesPence: bigint
  closingBalancePence: bigint
  commitmentPence: bigint
  // bps
  xirrBps: number | null
  // Pending preferred return (0n for non-pref kinds).
  pendingPreferredReturnPence: bigint
  preferredReturnBps: number | null
  // Ledger entries within the period.
  ledger: InvestorStatementTx[]
}
