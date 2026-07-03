import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/db/user'
import { OnboardingForm } from './_onboarding-form'

export default async function OnboardingPage() {
  const sb = await supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  // Already in an org? Skip onboarding.
  const { data: memberships } = await sb
    .from('organisation_members')
    .select('organisation_id, accepted_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)

  const accepted = memberships?.find((m) => m.accepted_at !== null)
  if (accepted) redirect('/dashboard')

  // Pending invitations?
  const { data: invitations } = await sb
    .from('invitations')
    .select('id, organisation_id, role, organisations(name)')
    .eq('email', user.email ?? '')
    .is('accepted_at', null)
    .is('revoked_at', null)

  return (
    <div className="mx-auto max-w-md p-6 py-12 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Welcome to TenureIQ</h1>
        <p className="text-sm text-muted-foreground">
          Create a new organisation, or accept a pending invitation.
        </p>
      </div>
      <OnboardingForm invitations={invitations ?? []} />
    </div>
  )
}
