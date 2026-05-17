import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { env } from '@/env'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { UploadForm } from './_components/upload-form'

export default async function UploadDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>
}) {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/documents')

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
        <PageHeader title="Upload document" />
        <EmptyState
          title="Add a property first"
          description="A document attaches to a property."
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
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Upload document"
        description="Drop a PDF or photo. Compliance kinds are OCR'd for issue + expiry dates."
      />
      <UploadForm
        organisationId={auth.organisationId}
        supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL}
        supabaseAnonKey={env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
        properties={properties}
        initialPropertyId={propertyId}
      />
    </div>
  )
}
