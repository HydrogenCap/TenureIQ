// app/(app)/tenancies/import/page.tsx

import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'
import { TenancyImportWizard } from './_components/import-wizard'

export default async function TenancyImportPage() {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/tenancies')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Import tenancies"
        description="Bulk-add tenancies from a spreadsheet. Properties are resolved by postcode; ambiguous matches fall back to property_id."
      />
      <TenancyImportWizard />
    </div>
  )
}
