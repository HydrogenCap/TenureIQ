// app/(app)/properties/new/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { PropertyForm } from '../_components/property-form'

export default async function NewPropertyPage() {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/properties')

  const sb = await supabaseServer()
  const { data: rawEntities } = await sb
    .from('entities')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  const entities = (rawEntities ?? []) as Array<{ id: string; name: string }>

  if (entities.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="New property" />
        <EmptyState
          title="Add an entity first"
          description="Every property is held by an entity. Create one before you add a property."
          action={
            <Link href="/entities/new" className={buttonVariants()}>
              + New entity
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New property" description="Add a property to your portfolio." />
      <PropertyForm mode="create" entities={entities} />
    </div>
  )
}
