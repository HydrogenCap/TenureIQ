import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { ReportJobForm } from '../_components/report-job-form'

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>
}) {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) redirect('/maintenance')

  const { propertyId } = await searchParams

  const sb = await supabaseServer()
  const [propsRes, unitsRes] = await Promise.all([
    sb
      .from('properties')
      .select('id, address_line_1, postcode')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('address_line_1'),
    sb
      .from('units')
      .select('id, label, property_id')
      .is('deleted_at', null)
      .order('label'),
  ])

  const properties = ((propsRes.data ?? []) as Array<{
    id: string
    address_line_1: string
    postcode: string
  }>).map((p) => ({ id: p.id, name: `${p.address_line_1}, ${p.postcode}` }))
  const units = ((unitsRes.data ?? []) as Array<{
    id: string
    label: string
    property_id: string
  }>).map((u) => ({ id: u.id, label: u.label, propertyId: u.property_id }))

  if (properties.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="Report a job" />
        <EmptyState
          title="Add a property first"
          description="A maintenance job attaches to a property."
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
        title="Report a maintenance job"
        description="Priority drives the SLA window. Pick the kind so reports group correctly."
      />
      <ReportJobForm
        properties={properties}
        units={units}
        initialPropertyId={propertyId}
      />
    </div>
  )
}
