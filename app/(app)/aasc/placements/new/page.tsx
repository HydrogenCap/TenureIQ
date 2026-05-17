import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import {
  PlacementForm,
  type ContractOpt,
  type PropertyOpt,
  type UnitOpt,
} from '../_components/placement-form'

export default async function NewPlacementPage({
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string; propertyId?: string }>
}) {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/aasc/placements')

  const { contractId, propertyId } = await searchParams

  const sb = await supabaseServer()
  const [contractsRes, propsRes, unitsRes] = await Promise.all([
    sb
      .from('aasc_contracts')
      .select('id, contractor, reference, status')
      .eq('organisation_id', auth.organisationId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('start_date', { ascending: false }),
    sb
      .from('properties')
      .select('id, address_line_1, postcode, is_aasc_property')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('address_line_1'),
    sb
      .from('units')
      .select('id, label, property_id')
      .is('deleted_at', null)
      .order('label'),
  ])

  const contracts = ((contractsRes.data ?? []) as Array<{
    id: string
    contractor: string
    reference: string | null
  }>).map<ContractOpt>((c) => ({
    id: c.id,
    contractor: c.contractor,
    reference: c.reference,
  }))

  const properties = ((propsRes.data ?? []) as Array<{
    id: string
    address_line_1: string
    postcode: string
    is_aasc_property: boolean
  }>).map<PropertyOpt>((p) => ({
    id: p.id,
    addressLine1: p.address_line_1,
    postcode: p.postcode,
    isAasc: p.is_aasc_property,
  }))

  const units = ((unitsRes.data ?? []) as Array<{
    id: string
    label: string
    property_id: string
  }>).map<UnitOpt>((u) => ({ id: u.id, label: u.label, propertyId: u.property_id }))

  if (contracts.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="New AASC placement" />
        <EmptyState
          title="No active contracts"
          description="Record a Clearsprings or Serco contract first — placements live under a contract."
          action={
            <Link href="/aasc/contracts/new" className={buttonVariants()}>
              + New contract
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New AASC placement"
        description="One placement per occupancy. Counts only — no identity data."
      />
      <PlacementForm
        contracts={contracts}
        properties={properties}
        units={units}
        initialContractId={contractId}
        initialPropertyId={propertyId}
      />
    </div>
  )
}
