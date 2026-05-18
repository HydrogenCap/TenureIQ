import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { OpenAccountForm } from '../_components/open-account-form'

export default async function NewAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ investorId?: string }>
}) {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/investors')
  const { investorId } = await searchParams

  const sb = await supabaseServer()
  const [investorsRes, entitiesRes] = await Promise.all([
    sb
      .from('investors')
      .select('id, name')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('name'),
    sb
      .from('entities')
      .select('id, name')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('name'),
  ])
  const investors = ((investorsRes.data ?? []) as Array<{ id: string; name: string }>).map(
    (i) => ({ id: i.id, name: i.name }),
  )
  const entities = ((entitiesRes.data ?? []) as Array<{ id: string; name: string }>).map(
    (e) => ({ id: e.id, name: e.name }),
  )

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Open capital account" />
      <OpenAccountForm
        investors={investors}
        entities={entities}
        initialInvestorId={investorId}
      />
    </div>
  )
}
