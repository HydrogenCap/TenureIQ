import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { BankAccountForm } from '../_components/bank-account-form'

export default async function NewBankAccountPage() {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/bank-accounts')

  const sb = await supabaseServer()
  const { data: rawEntities } = await sb
    .from('entities')
    .select('id, name')
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('name')

  const entities = (rawEntities ?? []) as Array<{ id: string; name: string }>

  if (entities.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="New bank account" />
        <EmptyState
          title="Add an entity first"
          description="Every bank account belongs to an entity."
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
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New bank account" description="Holds transactions for one entity." />
      <BankAccountForm mode="create" entities={entities} />
    </div>
  )
}
