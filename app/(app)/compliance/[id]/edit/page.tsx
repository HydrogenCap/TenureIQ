import { notFound, redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { ComplianceItemForm } from '../../_components/compliance-item-form'
import type { ComplianceItemCreate, ComplianceKind } from '@/lib/schemas/compliance-item'

type DbRow = {
  id: string
  property_id: string
  unit_id: string | null
  kind: string
  issue_date: string | null
  expiry_date: string | null
  issuer: string | null
  document_id: string | null
  notes: string | null
  status: string
}

export default async function EditCompliancePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect(`/compliance/${id}`)

  const sb = await supabaseServer()
  const { data } = await sb
    .from('compliance_items')
    .select('id, property_id, unit_id, kind, issue_date, expiry_date, issuer, document_id, notes, status')
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

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

  const initial: ComplianceItemCreate = {
    propertyId: data.property_id,
    unitId: data.unit_id,
    kind: data.kind as ComplianceKind,
    issueDate: data.issue_date ? new Date(data.issue_date) : null,
    expiryDate: data.expiry_date ? new Date(data.expiry_date) : null,
    issuer: data.issuer,
    documentId: data.document_id,
    notes: data.notes,
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Edit ${data.kind.replace(/_/g, ' ')}`} />
      <ComplianceItemForm mode="edit" itemId={id} properties={properties} initial={initial} />
    </div>
  )
}
