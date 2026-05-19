// lib/reports/property-pack/types.ts

import type { EpcBand } from '@/lib/domain/mees'

export type PropertyPackMortgage = {
  id: string
  lender: string
  product: string
  isInterestOnly: boolean
  balancePence: bigint
  interestRateBps: number
  monthlyPaymentPence: bigint
  fixedEndDate: string | null
}

export type PropertyPackValuation = {
  valuationDate: string
  valuePence: bigint
  kind: string
  source: string | null
}

export type PropertyPackTenancy = {
  id: string
  kind: string
  startDate: string
  endDateIntended: string | null
  rentPence: bigint
  rentPeriod: string
  monthlyRentPence: bigint
  status: string
}

export type PropertyPackComplianceRow = {
  kind: string
  status: 'valid' | 'expiring' | 'expired' | 'missing' | 'exempt'
  expiryDate: string | null
  issuer: string | null
}

export type PropertyPackData = {
  organisationName: string
  asOf: Date

  // Address + structural
  addressLine1: string
  addressLine2: string | null
  city: string
  postcode: string
  county: string | null
  localAuthority: string | null
  kind: string
  bedroomsTotal: number | null
  bathroomsTotal: number | null
  internalAreaSqm: number | null

  // Entity
  entityName: string | null

  // Acquisition
  purchasePricePence: bigint
  purchaseDate: string
  sdltPaidPence: bigint | null
  refurbCostPence: bigint | null
  acquisitionCostsPence: bigint | null
  allInCostPence: bigint

  // Current state
  currentValuationPence: bigint | null
  currentValuationAsOf: string | null

  // KPIs derived from the above
  equityPence: bigint
  ltvBps: number | null
  grossYieldBps: number | null
  weeklyRentRollPence: bigint
  totalDebtPence: bigint

  // Energy / MEES
  epcRating: EpcBand | null
  epcExpiry: string | null
  meesStatus: 'compliant' | 'let_blocked' | 'epc_expired' | 'epc_missing'

  // HMO
  hmoLicenceKind: string | null
  hmoLicenceRef: string | null
  hmoLicenceExpiry: string | null
  hmoPermittedOccupancy: number | null

  // Planning
  article4Area: boolean

  // Related tables
  mortgages: PropertyPackMortgage[]
  valuations: PropertyPackValuation[]
  tenancies: PropertyPackTenancy[]
  compliance: PropertyPackComplianceRow[]

  notes: string | null
}
