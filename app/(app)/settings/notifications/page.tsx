import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { PreferencesForm } from './_components/preferences-form'

type MemberRow = {
  notify_compliance: boolean
  notify_mortgages: boolean
  notify_tenancies: boolean
}

export default async function NotificationsPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data } = await sb
    .from('organisation_members')
    .select('notify_compliance, notify_mortgages, notify_tenancies')
    .eq('organisation_id', auth.organisationId)
    .eq('user_id', auth.userId)
    .is('deleted_at', null)
    .maybeSingle<MemberRow>()

  const initial = {
    notifyCompliance: data?.notify_compliance ?? true,
    notifyMortgages: data?.notify_mortgages ?? true,
    notifyTenancies: data?.notify_tenancies ?? true,
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Choose which reminder emails you want from TenureIQ. Per-user — different members can opt in to different streams."
      />
      <PreferencesForm initial={initial} />
    </div>
  )
}
