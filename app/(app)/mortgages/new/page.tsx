import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { MortgageForm, type PropertyOption } from '../_components/mortgage-form'

export default async function NewMortgagePage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>
}) {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/mortgages')

  const { propertyId } = await searchParams

  const sb = await supabaseServer()
  const { data: rawProps } = await sb
    .from('properties')
    .select('id, address_line_1, postcode')
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('address_line_1')

  const properties = ((rawProps ?? []) as Array<{
    id: string
    address_line_1: string
    postcode: string
  }>).map<PropertyOption>((p) => ({
    id: p.id,
    addressLine1: p.address_line_1,
    postcode: p.postcode,
  }))

  if (properties.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="New mortgage" />
        <EmptyState
          title="Add a property first"
          description="A mortgage needs a property to secure against."
          action={
            <Link href="/properties/new" className={buttonVariants()}>
              + New property
            </Link>
          }
        />
      </div>
    )
  }

  // If propertyId is supplied via the Finance-tab deep link, preselect it
  // — but only if it's actually owned by the org (already filtered above).
  const preselected = propertyId && properties.some((p) => p.id === propertyId)
    ? propertyId
    : undefined

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New mortgage"
        description="Add a loan secured against a property. The opening balance seeds the event ledger."
      />
      <MortgageForm
        mode="create"
        properties={properties}
        initial={preselected ? { propertyId: preselected } : undefined}
      />
    </div>
  )
}
