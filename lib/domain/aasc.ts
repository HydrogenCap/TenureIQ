// lib/domain/aasc.ts

import { weeklyToMonthlyPence } from './lha'

export const CLEARSPRINGS_UPLIFT_BPS = 4000 // +40% on SAR

/**
 * Clearsprings rate ceiling: LHA Shared Accommodation Rate * 1.40.
 */
export function clearspringsMaxWeeklyPence(sarWeeklyPence: bigint): bigint {
  return (sarWeeklyPence * BigInt(10000 + CLEARSPRINGS_UPLIFT_BPS)) / 10000n
}

export function clearspringsMaxMonthlyPence(sarWeeklyPence: bigint): bigint {
  return weeklyToMonthlyPence(clearspringsMaxWeeklyPence(sarWeeklyPence))
}

export type SercoAreaStatus = 'open' | 'limited' | 'closed' | 'unknown'

export type SercoArea = {
  localAuthority: string
  status: SercoAreaStatus
}

export function sercoAreaStatus(
  areas: SercoArea[],
  localAuthority: string
): SercoAreaStatus {
  const match = areas.find(
    (a) => a.localAuthority.toLowerCase() === localAuthority.toLowerCase()
  )
  return match?.status ?? 'unknown'
}

export type ClearspringsAreaDemand = {
  localAuthority: string
  demandPending: number
}

/**
 * Returns demand-pending bed count for a local authority, or null if not found.
 * Negative values indicate oversupply.
 */
export function clearspringsDemandGap(
  areas: ClearspringsAreaDemand[],
  localAuthority: string
): number | null {
  const match = areas.find(
    (a) => a.localAuthority.toLowerCase() === localAuthority.toLowerCase()
  )
  return match?.demandPending ?? null
}

/**
 * Modelled monthly placement income for a Clearsprings shared-supply HMO.
 * occupancy: 0..1 (e.g. 0.95 for 95% expected occupancy).
 */
export function projectedClearspringsMonthlyIncomePence(input: {
  sarWeeklyPence: bigint
  bedCount: number
  occupancy: number
}): bigint {
  const maxMonthlyPerBed = clearspringsMaxMonthlyPence(input.sarWeeklyPence)
  const occupancyBps = BigInt(Math.round(input.occupancy * 10000))
  return (maxMonthlyPerBed * BigInt(input.bedCount) * occupancyBps) / 10000n
}
