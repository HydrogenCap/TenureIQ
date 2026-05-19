// lib/reports/entity-pandl/types.ts

import type { CategoryCode } from '@/lib/domain/transactions'

export type EntityPandLMonth = {
  monthLabel: string // e.g. 'Jan'
  netPence: bigint
  byCategory: Partial<Record<CategoryCode, bigint>>
}

export type EntityPandLData = {
  organisationName: string
  entityName: string
  entityKind: string
  asOf: Date
  year: number
  // months in calendar order — Jan first, current month last
  months: EntityPandLMonth[]
  // Every category that's appeared this year, split credit / debit
  creditCategories: string[]
  debitCategories: string[]
  // YTD totals
  ytdNetPence: bigint
  ytdGrossRentPence: bigint
  ytdMortgageInterestPence: bigint
  ytdOtherCostsPence: bigint
  // Tax block — null when no rent activity
  taxEstimate: {
    isCompany: boolean
    netTaxPence: bigint
    effectiveRateOnRentBps: number | null
    section24CostPence: bigint | null
    headline: string
    rateAssumption: string
  } | null
}
