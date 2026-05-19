// lib/reports/aasc-placements/types.ts
//
// IMPORTANT: This report rolls up placement data WITHOUT any
// service-user identity. Per the data-protection contract with
// Clearsprings / Serco, AASC placements store only service_user_count
// (an integer). No names, DOBs, or nationalities appear anywhere in
// this report.

export type PlacementRow = {
  id: string
  placementRef: string
  contractor: 'clearsprings' | 'serco' | null
  contractRef: string | null
  propertyAddressLine1: string
  propertyPostcode: string
  serviceUserCount: number
  weeklyRatePence: bigint
  monthlyGrossPence: bigint
  monthlyNetPence: bigint
  annualGrossPence: bigint
  annualNetPence: bigint
  startDate: string // ISO date
  endDateExpected: string | null
  status: 'active' | 'ended' | 'terminated' | string
}

export type AascPlacementsData = {
  organisationName: string
  asOf: Date
  rows: PlacementRow[]
  totals: {
    activePlacementCount: number
    totalServiceUserCount: number
    annualGrossPence: bigint
    annualNetPence: bigint
    weeklyGrossPence: bigint
  }
  // Next contract break / end date (whichever is sooner).
  nextContractEventDate: string | null
}
