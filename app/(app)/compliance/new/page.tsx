import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { ComplianceItemForm } from '../_components/compliance-item-form'

export default async function NewCompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>
}) {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/compliance')

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
  }>).map((p) => ({ id: p.id, name: `${p.address_line_1}, ${p.postcode}` }))

  if (properties.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="Record certificate" />
        <EmptyState
          title="Add a property first"
          description="A compliance item attaches to a property."
          action={
            <Link href="/properties/new" className={buttonVariants()}>
              + New property
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Record certificate"
        description="Add a statutory or recommended certificate. Reminders auto-derive from the expiry date once the M6 reminder engine is wired up."
      />
      <ComplianceItemForm
        mode="create"
        properties={properties}
        initial={propertyId ? { propertyId } : undefined}
      />
    </div>
  )
}
