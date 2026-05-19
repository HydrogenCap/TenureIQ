// lib/reports/property-pack/fetch.ts
// Comprehensive single-property profile for a refinance / investor pack.

import { supabaseServer } from '@/lib/db/user'
import { meesStatus, type EpcBand } from '@/lib/domain/mees'
import { ltvBps as computeLtv } from '@/lib/domain/equity'
import { complianceStatus } from '@/lib/domain/compliance'
import {
  monthlyRentPence,
  weeklyRentPence,
  type RentPeriod,
} from '@/lib/domain/rent'
import type {
  PropertyPackData,
  PropertyPackComplianceRow,
  PropertyPackMortgage,
  PropertyPackTenancy,
  PropertyPackValuation,
} from './types'

type PropertyDb = {
  id: string
  entity_id: string
  address_line_1: string
  address_line_2: string | null
  city: string
  county: string | null
  postcode: string
  local_authority: string | null
  kind: string
  bedrooms_total: number | null
  bathrooms_total: number | null
  internal_area_sqm: string | number | null
  purchase_price_pence: string | number
  purchase_date: string
  sdlt_paid_pence: string | number | null
  refurb_cost_pence: string | number | null
  acquisition_costs_pence: string | number | null
  current_valuation_pence: string | number | null
  current_valuation_as_of: string | null
  epc_rating: string | null
  epc_expiry: string | null
  hmo_licence_kind: string | null
  hmo_licence_ref: string | null
  hmo_licence_expiry: string | null
  hmo_permitted_occupancy: number | null
  article_4_area: boolean
  notes: string | null
}

function toBig(v: string | number | null): bigint | null {
  if (v === null) return null
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}
function toBigReq(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export async function fetchPropertyPack(
  propertyId: string,
  organisationId: string,
): Promise<PropertyPackData | null> {
  const sb = await supabaseServer()

  const [orgRes, propRes] = await Promise.all([
    sb.from('organisations').select('name').eq('id', organisationId).single<{
      name: string
    }>(),
    sb
      .from('properties')
      .select(
        'id, entity_id, address_line_1, address_line_2, city, county, postcode, local_authority, kind, bedrooms_total, bathrooms_total, internal_area_sqm, purchase_price_pence, purchase_date, sdlt_paid_pence, refurb_cost_pence, acquisition_costs_pence, current_valuation_pence, current_valuation_as_of, epc_rating, epc_expiry, hmo_licence_kind, hmo_licence_ref, hmo_licence_expiry, hmo_permitted_occupancy, article_4_area, notes',
      )
      .eq('id', propertyId)
      .eq('organisation_id', organisationId)
      .is('deleted_at', null)
      .maybeSingle<PropertyDb>(),
  ])

  if (!propRes.data) return null
  const property = propRes.data

  const [
    entityRes,
    mortgagesRes,
    valuationsRes,
    tenanciesRes,
    complianceRes,
  ] = await Promise.all([
    sb
      .from('entities')
      .select('name')
      .eq('id', property.entity_id)
      .eq('organisation_id', organisationId)
      .maybeSingle<{ name: string }>(),
    sb
      .from('mortgages')
      .select(
        'id, lender, product, is_interest_only, current_balance_pence, interest_rate_bps, monthly_payment_pence, fixed_end_date',
      )
      .eq('property_id', propertyId)
      .eq('organisation_id', organisationId)
      .is('deleted_at', null)
      .order('lender'),
    sb
      .from('valuations')
      .select('valuation_date, value_pence, kind, source')
      .eq('property_id', propertyId)
      .eq('organisation_id', organisationId)
      .is('deleted_at', null)
      .order('valuation_date', { ascending: false })
      .limit(10),
    sb
      .from('tenancies')
      .select('id, kind, start_date, end_date_intended, rent_pence, rent_period, status')
      .eq('property_id', propertyId)
      .eq('organisation_id', organisationId)
      .is('deleted_at', null)
      .order('start_date', { ascending: false }),
    sb
      .from('compliance_items')
      .select('kind, status, expiry_date, issuer')
      .eq('property_id', propertyId)
      .eq('organisation_id', organisationId)
      .is('deleted_at', null)
      .order('kind'),
  ])

  const orgName = orgRes.data?.name ?? '—'
  const entityName = entityRes.data?.name ?? null

  const mortgages: PropertyPackMortgage[] = ((mortgagesRes.data ?? []) as Array<{
    id: string
    lender: string
    product: string
    is_interest_only: boolean
    current_balance_pence: string | number
    interest_rate_bps: number
    monthly_payment_pence: string | number
    fixed_end_date: string | null
  }>).map((m) => ({
    id: m.id,
    lender: m.lender,
    product: m.product,
    isInterestOnly: m.is_interest_only,
    balancePence: toBigReq(m.current_balance_pence),
    interestRateBps: m.interest_rate_bps,
    monthlyPaymentPence: toBigReq(m.monthly_payment_pence),
    fixedEndDate: m.fixed_end_date,
  }))

  const valuations: PropertyPackValuation[] = ((valuationsRes.data ?? []) as Array<{
    valuation_date: string
    value_pence: string | number
    kind: string
    source: string | null
  }>).map((v) => ({
    valuationDate: v.valuation_date,
    valuePence: toBigReq(v.value_pence),
    kind: v.kind,
    source: v.source,
  }))

  const tenancies: PropertyPackTenancy[] = ((tenanciesRes.data ?? []) as Array<{
    id: string
    kind: string
    start_date: string
    end_date_intended: string | null
    rent_pence: string | number
    rent_period: string
    status: string
  }>).map((t) => ({
    id: t.id,
    kind: t.kind,
    startDate: t.start_date,
    endDateIntended: t.end_date_intended,
    rentPence: toBigReq(t.rent_pence),
    rentPeriod: t.rent_period,
    monthlyRentPence: monthlyRentPence(
      toBigReq(t.rent_pence),
      t.rent_period as RentPeriod,
    ),
    status: t.status,
  }))

  const compliance: PropertyPackComplianceRow[] = ((complianceRes.data ?? []) as Array<{
    kind: string
    status: string
    expiry_date: string | null
    issuer: string | null
  }>).map((c) => {
    const status =
      c.status === 'exempt'
        ? 'exempt'
        : complianceStatus(c.expiry_date)
    return {
      kind: c.kind,
      status,
      expiryDate: c.expiry_date,
      issuer: c.issuer,
    }
  })

  // Active tenancies' weekly rent roll for the gross yield calc.
  const weeklyRentRollPence = tenancies
    .filter((t) => t.status === 'active')
    .reduce(
      (s, t) =>
        s + weeklyRentPence(t.rentPence, t.rentPeriod as RentPeriod),
      0n,
    )

  const totalDebtPence = mortgages.reduce((s, m) => s + m.balancePence, 0n)
  const currentValuationPence = toBig(property.current_valuation_pence)
  const valueForKpis =
    currentValuationPence ?? toBigReq(property.purchase_price_pence)

  const ltvBps =
    currentValuationPence === null || totalDebtPence === 0n
      ? totalDebtPence === 0n
        ? 0
        : null
      : computeLtv({
          valuationPence: currentValuationPence,
          balancePence: totalDebtPence,
        })

  const equityPence = valueForKpis - totalDebtPence

  const grossYieldBps =
    valueForKpis > 0n && weeklyRentRollPence > 0n
      ? Number(((weeklyRentRollPence * 52n) * 10_000n) / valueForKpis)
      : null

  const sdltPaidPence = toBig(property.sdlt_paid_pence)
  const refurbCostPence = toBig(property.refurb_cost_pence)
  const acquisitionCostsPence = toBig(property.acquisition_costs_pence)
  const allInCostPence =
    toBigReq(property.purchase_price_pence) +
    (sdltPaidPence ?? 0n) +
    (refurbCostPence ?? 0n) +
    (acquisitionCostsPence ?? 0n)

  const internalAreaSqm =
    property.internal_area_sqm === null
      ? null
      : Number(property.internal_area_sqm)

  return {
    organisationName: orgName,
    asOf: new Date(),
    addressLine1: property.address_line_1,
    addressLine2: property.address_line_2,
    city: property.city,
    postcode: property.postcode,
    county: property.county,
    localAuthority: property.local_authority,
    kind: property.kind,
    bedroomsTotal: property.bedrooms_total,
    bathroomsTotal: property.bathrooms_total,
    internalAreaSqm,
    entityName,
    purchasePricePence: toBigReq(property.purchase_price_pence),
    purchaseDate: property.purchase_date,
    sdltPaidPence,
    refurbCostPence,
    acquisitionCostsPence,
    allInCostPence,
    currentValuationPence,
    currentValuationAsOf: property.current_valuation_as_of,
    equityPence,
    ltvBps,
    grossYieldBps,
    weeklyRentRollPence,
    totalDebtPence,
    epcRating:
      property.epc_rating === null ? null : (property.epc_rating as EpcBand),
    epcExpiry: property.epc_expiry,
    meesStatus: meesStatus(
      property.epc_rating === null
        ? null
        : (property.epc_rating as EpcBand),
      property.epc_expiry,
    ),
    hmoLicenceKind: property.hmo_licence_kind,
    hmoLicenceRef: property.hmo_licence_ref,
    hmoLicenceExpiry: property.hmo_licence_expiry,
    hmoPermittedOccupancy: property.hmo_permitted_occupancy,
    article4Area: property.article_4_area,
    mortgages,
    valuations,
    tenancies,
    compliance,
    notes: property.notes,
  }
}
