import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { ComplianceActions } from './_components/compliance-actions'

type DbRow = {
  id: string
  property_id: string
  kind: string
  status: string
  issue_date: string | null
  expiry_date: string | null
  issuer: string | null
  notes: string | null
  property: Array<{ address_line_1: string; postcode: string; city: string }>
}

export default async function ComplianceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data } = await sb
    .from('compliance_items')
    .select(
      'id, property_id, kind, status, issue_date, expiry_date, issuer, notes, property:properties(address_line_1, postcode, city)',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  const property = data.property?.[0]
  const canManage =
    auth.role === 'owner' || auth.role === 'admin' || auth.role === 'manager'

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.kind.replace(/_/g, ' ')}
        description={
          property
            ? `${property.address_line_1}, ${property.city} ${property.postcode}`
            : undefined
        }
        actions={
          <Link
            href={`/properties/${data.property_id}?tab=compliance`}
            className="self-center text-sm font-medium text-muted-foreground hover:underline"
          >
            ← Back to property
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={data.kind} />
        <StatusBadge status={data.status} />
      </div>

      <ComplianceActions itemId={data.id} canManage={canManage} status={data.status} />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Row label="Issued" rowValue={<DateDisplay date={data.issue_date} />} />
        <Row label="Expires" rowValue={<DateDisplay date={data.expiry_date} />} />
        <Row label="Distance" rowValue={<DateDisplay date={data.expiry_date} distance />} />
        <Row label="Issuer" rowValue={data.issuer ?? '—'} />
        {data.notes && (
          <div className="sm:col-span-2">
            <h3 className="mb-2 text-base font-medium">Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, rowValue }: { label: string; rowValue: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{rowValue ?? '—'}</p>
    </div>
  )
}
