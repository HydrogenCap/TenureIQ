// app/(app)/properties/import/page.tsx
import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'
import { PropertyImportWizard } from './_components/import-wizard'

export default async function PropertyImportPage() {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/properties')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Import properties"
        description="Bulk-add properties from a CSV. Rows are validated row-by-row; errors are shown before any insert."
      />
      <PropertyImportWizard />
    </div>
  )
}
