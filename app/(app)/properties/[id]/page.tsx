// app/(app)/properties/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PropertyHeader } from '../_components/property-header'
import { PropertyKpisRow } from '../_components/property-kpis'
import { PropertyTabs } from '../_components/property-tabs'
import { propertyKpis } from '@/lib/domain/property-kpis'
import { weeklyRentPence, type RentPeriod } from '@/lib/domain/rent'

type PropertyRow = {
  id: string
  organisation_id: string
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
  purchase_price_pence: string | number
  purchase_date: string
  sdlt_paid_pence: string | number | null
  refurb_cost_pence: string | number | null
  acquisition_costs_pence: string | number | null
  current_valuation_pence: string | number | null
  current_valuation_as_of: string | null
  epc_rating: string | null
  epc_expiry: string | null
  hmo_licence_kind: string
  hmo_licence_ref: string | null
  hmo_licence_expiry: string | null
  hmo_permitted_occupancy: number | null
  article_4_area: boolean
  is_aasc_property: boolean
  notes: string | null
  deleted_at: string | null
}

function toBig(v: string | number | null): bigint | null {
  if (v === null) return null
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

function toBigRequired(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams

  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data: property } = await sb
    .from('properties')
    .select('*')
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .maybeSingle<PropertyRow>()

  if (!property) notFound()

  const { data: rawEntity } = await sb
    .from('entities')
    .select('name')
    .eq('id', property.entity_id)
    .eq('organisation_id', auth.organisationId)
    .maybeSingle<{ name: string }>()

  const entityName = rawEntity?.name ?? '—'

  const { data: rawMortgages } = await sb
    .from('mortgages')
    .select('current_balance_pence')
    .eq('property_id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  const mortgages = (rawMortgages ?? []) as Array<{ current_balance_pence: string | number }>
  const mortgageBalancePence = mortgages.reduce(
    (sum, m) => sum + toBigRequired(m.current_balance_pence),
    0n,
  )

  // Weekly rent roll — sum of active tenancies for this property,
  // normalised to weekly via the shared domain helper so monthly /
  // four-weekly / annual contracts all roll up consistently.
  const { data: rawTenancies } = await sb
    .from('tenancies')
    .select('rent_pence, rent_period, status')
    .eq('property_id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  const tenancies = (rawTenancies ?? []) as Array<{
    rent_pence: string | number | null
    rent_period: string
    status: string
  }>
  const weeklyRentRollPence = tenancies
    .filter((t) => t.status === 'active' && t.rent_pence !== null)
    .reduce(
      (sum, t) =>
        sum +
        weeklyRentPence(toBigRequired(t.rent_pence!), t.rent_period as RentPeriod),
      0n,
    )

  const kpis = propertyKpis({
    purchasePricePence: toBigRequired(property.purchase_price_pence),
    currentValuationPence: toBig(property.current_valuation_pence),
    acquisitionCostsPence: toBig(property.acquisition_costs_pence),
    refurbCostPence: toBig(property.refurb_cost_pence),
    sdltPaidPence: toBig(property.sdlt_paid_pence),
    mortgageBalancePence: mortgages.length > 0 ? mortgageBalancePence : null,
    weeklyRentRollPence: weeklyRentRollPence > 0n ? weeklyRentRollPence : null,
  })

  const canManage =
    auth.ok && (auth.role === 'owner' || auth.role === 'admin' || auth.role === 'manager')
  const canRestore = auth.ok && (auth.role === 'owner' || auth.role === 'admin')

  const activeTab = tab ?? 'overview'

  const overviewProperty = {
    addressLine1: property.address_line_1,
    addressLine2: property.address_line_2,
    city: property.city,
    county: property.county,
    postcode: property.postcode,
    localAuthority: property.local_authority,
    kind: property.kind,
    bedroomsTotal: property.bedrooms_total,
    bathroomsTotal: property.bathrooms_total,
    purchasePricePence: toBigRequired(property.purchase_price_pence),
    purchaseDate: property.purchase_date,
    sdltPaidPence: toBig(property.sdlt_paid_pence),
    refurbCostPence: toBig(property.refurb_cost_pence),
    acquisitionCostsPence: toBig(property.acquisition_costs_pence),
    epcRating: property.epc_rating,
    epcExpiry: property.epc_expiry,
    hmoLicenceKind: property.hmo_licence_kind,
    hmoLicenceRef: property.hmo_licence_ref,
    hmoLicenceExpiry: property.hmo_licence_expiry,
    hmoPermittedOccupancy: property.hmo_permitted_occupancy,
    article4Area: property.article_4_area,
    isAascProperty: property.is_aasc_property,
    notes: property.notes,
  }

  return (
    <div className="space-y-6">
      <PropertyHeader
        id={property.id}
        addressLine1={property.address_line_1}
        city={property.city}
        postcode={property.postcode}
        kind={property.kind}
        entityName={entityName}
        archived={!!property.deleted_at}
        canManage={canManage}
        canRestore={canRestore}
      />

      <PropertyKpisRow kpis={kpis} />

      <PropertyTabs activeTab={activeTab} property={overviewProperty} propertyId={property.id} />
    </div>
  )
}
