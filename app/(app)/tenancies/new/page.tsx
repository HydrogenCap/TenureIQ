// app/(app)/tenancies/new/page.tsx

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import {
  TenancyForm,
  type PropertyOption,
  type UnitOption,
} from '../_components/tenancy-form'
import type { EpcBand } from '@/lib/domain/mees'

type PropDbRow = {
  id: string
  address_line_1: string
  postcode: string
  epc_rating: string | null
  epc_expiry: string | null
}
type UnitDbRow = { id: string; label: string; property_id: string }

export default async function NewTenancyPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>
}) {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/tenancies')

  const { propertyId } = await searchParams

  const sb = await supabaseServer()
  const { data: rawProps } = await sb
    .from('properties')
    .select('id, address_line_1, postcode, epc_rating, epc_expiry')
    .is('deleted_at', null)
    .order('address_line_1')

  const propRows = (rawProps ?? []) as PropDbRow[]

  if (propRows.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="New tenancy" />
        <EmptyState
          title="Add a property first"
          description="A tenancy needs a property to attach to."
          action={
            <Link href="/properties/new" className={buttonVariants()}>
              + New property
            </Link>
          }
        />
      </div>
    )
  }

  const { data: rawUnits } = await sb
    .from('units')
    .select('id, label, property_id')
    .is('deleted_at', null)
    .order('label')

  const unitRows = (rawUnits ?? []) as UnitDbRow[]

  const properties: PropertyOption[] = propRows.map((p) => ({
    id: p.id,
    addressLine1: p.address_line_1,
    postcode: p.postcode,
    epcRating: p.epc_rating === null ? null : (p.epc_rating as EpcBand),
    epcExpiry: p.epc_expiry,
  }))
  const units: UnitOption[] = unitRows.map((u) => ({
    id: u.id,
    label: u.label,
    propertyId: u.property_id,
  }))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New tenancy"
        description="Add a let — AST, licence, company let, or holiday let. AASC placements come from the AASC module."
      />
      <TenancyForm properties={properties} units={units} initialPropertyId={propertyId} />
    </div>
  )
}
