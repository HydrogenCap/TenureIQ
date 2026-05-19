// lib/reports/aasc-placements/fetch.ts
//
// Active-and-recent placements + per-contract commission lookup +
// totals roll-up. Returns plain data for the PDF renderer.

import { supabaseServer } from '@/lib/db/user'
import {
  placementGrossPerWeekPence,
  placementNetPerWeekPence,
} from '@/lib/domain/aasc-placement'
import { weeklyToMonthlyPence } from '@/lib/domain/lha'
import type { AascPlacementsData, PlacementRow } from './types'

type PlacementDb = {
  id: string
  placement_ref: string
  contract_id: string | null
  property_id: string
  weekly_rate_pence: string | number
  commission_rate_bps_override: number | null
  service_user_count: number
  start_date: string
  end_date_expected: string | null
  end_date: string | null
  status: string
  contract: Array<{
    contractor: 'clearsprings' | 'serco'
    reference: string | null
    break_clause_date: string | null
    end_date: string | null
    commission_rate_bps: number
  }>
  property: Array<{
    address_line_1: string
    postcode: string
  }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export async function fetchAascPlacements(
  organisationId: string,
): Promise<AascPlacementsData> {
  const sb = await supabaseServer()

  const [orgRes, placementsRes] = await Promise.all([
    sb
      .from('organisations')
      .select('name')
      .eq('id', organisationId)
      .single<{ name: string }>(),
    sb
      .from('aasc_placements')
      .select(
        'id, placement_ref, contract_id, property_id, weekly_rate_pence, commission_rate_bps_override, service_user_count, start_date, end_date_expected, end_date, status, contract:aasc_contracts(contractor, reference, break_clause_date, end_date, commission_rate_bps), property:properties(address_line_1, postcode)',
      )
      .eq('organisation_id', organisationId)
      .is('deleted_at', null)
      .order('status')
      .order('start_date', { ascending: false }),
  ])

  const orgName = orgRes.data?.name ?? '—'
  const placements = (placementsRes.data ?? []) as PlacementDb[]

  const rows: PlacementRow[] = placements.map((p) => {
    const weekly = toBig(p.weekly_rate_pence)
    const contract = p.contract?.[0] ?? null
    const property = p.property?.[0] ?? null
    const contractCommissionBps = contract?.commission_rate_bps ?? 0
    const grossWeekly = placementGrossPerWeekPence({
      weeklyRatePence: weekly,
      serviceUserCount: p.service_user_count,
    })
    const netWeekly = placementNetPerWeekPence({
      weeklyRatePence: weekly,
      serviceUserCount: p.service_user_count,
      commissionRateBpsOverride: p.commission_rate_bps_override,
      contractCommissionRateBps: contractCommissionBps,
    })

    return {
      id: p.id,
      placementRef: p.placement_ref,
      contractor: contract?.contractor ?? null,
      contractRef: contract?.reference ?? null,
      propertyAddressLine1: property?.address_line_1 ?? '—',
      propertyPostcode: property?.postcode ?? '',
      serviceUserCount: p.service_user_count,
      weeklyRatePence: weekly,
      monthlyGrossPence: weeklyToMonthlyPence(grossWeekly),
      monthlyNetPence: weeklyToMonthlyPence(netWeekly),
      annualGrossPence: grossWeekly * 52n,
      annualNetPence: netWeekly * 52n,
      startDate: p.start_date,
      endDateExpected: p.end_date_expected,
      status: p.status,
    }
  })

  const activeRows = rows.filter((r) => r.status === 'active')

  const totals = {
    activePlacementCount: activeRows.length,
    totalServiceUserCount: activeRows.reduce(
      (s, r) => s + r.serviceUserCount,
      0,
    ),
    annualGrossPence: activeRows.reduce((s, r) => s + r.annualGrossPence, 0n),
    annualNetPence: activeRows.reduce((s, r) => s + r.annualNetPence, 0n),
    weeklyGrossPence: activeRows.reduce(
      (s, r) =>
        s +
        placementGrossPerWeekPence({
          weeklyRatePence: r.weeklyRatePence,
          serviceUserCount: r.serviceUserCount,
        }),
      0n,
    ),
  }

  // Next contract event = soonest of break_clause_date / end_date across
  // every active contract referenced by an active placement.
  const eventDates: string[] = []
  for (const p of placements) {
    if (p.status !== 'active') continue
    const c = p.contract?.[0]
    if (!c) continue
    if (c.break_clause_date) eventDates.push(c.break_clause_date)
    if (c.end_date) eventDates.push(c.end_date)
  }
  eventDates.sort()
  const nextContractEventDate = eventDates[0] ?? null

  return {
    organisationName: orgName,
    asOf: new Date(),
    rows,
    totals,
    nextContractEventDate,
  }
}
