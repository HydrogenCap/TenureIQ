import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'
import { InvestorForm } from '../_components/investor-form'

export default async function NewInvestorPage() {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/investors')

  // Only owner/admin can collect KYC.
  const canEditKyc = auth.role === 'owner' || auth.role === 'admin'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New investor" />
      <InvestorForm mode="create" canEditKyc={canEditKyc} />
    </div>
  )
}
