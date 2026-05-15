// app/(app)/tenancies/[id]/page.tsx

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { TenancyActions } from './_components/tenancy-actions'
import { monthlyRentPence, annualRentPence, type RentPeriod } from '@/lib/domain/rent'

type DbRow = {
  id: string
  property_id: string
  unit_id: string | null
  kind: string
  status: string
  start_date: string
  end_date: string | null
  end_date_intended: string | null
  notice_given_at: string | null
  vacate_date: string | null
  rent_pence: string | number
  rent_period: string
  deposit_pence: string | number | null
  deposit_scheme: string | null
  deposit_scheme_ref: string | null
  notes: string | null
  deleted_at: string | null
  property: Array<{ address_line_1: string; postcode: string; city: string }>
  unit: Array<{ label: string }>
  tenant: Array<{
    id: string
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    right_to_rent_checked: boolean
    right_to_rent_expiry: string | null
  }>
  joint_tenants: Array<{
    tenant: Array<{
      id: string
      first_name: string
      last_name: string
      email: string | null
    }>
  }>
}

type RentChangeRow = {
  id: string
  effective_from: string
  new_rent_pence: string | number
  new_rent_period: string
  reason: string
  notes: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}
function toOptBig(v: string | number | null): bigint | null {
  return v === null ? null : toBig(v)
}

export default async function TenancyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data } = await sb
    .from('tenancies')
    .select(
      `*,
       property:properties(address_line_1, postcode, city),
       unit:units(label),
       tenant:tenants(id, first_name, last_name, email, phone, right_to_rent_checked, right_to_rent_expiry),
       joint_tenants:tenancy_tenants(tenant:tenants(id, first_name, last_name, email))`,
    )
    .eq('id', id)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  const { data: rawHistory } = await sb
    .from('rent_changes')
    .select('id, effective_from, new_rent_pence, new_rent_period, reason, notes')
    .eq('tenancy_id', id)
    .is('deleted_at', null)
    .order('effective_from', { ascending: false })

  const history = (rawHistory ?? []) as RentChangeRow[]

  const property = data.property?.[0]
  const unit = data.unit?.[0]
  const lead = data.tenant?.[0]
  const joints = data.joint_tenants?.flatMap((j) => j.tenant) ?? []

  const canManage =
    auth.role === 'owner' || auth.role === 'admin' || auth.role === 'manager'

  const rentMonthly = monthlyRentPence(toBig(data.rent_pence), data.rent_period as RentPeriod)
  const rentAnnual = annualRentPence(toBig(data.rent_pence), data.rent_period as RentPeriod)

  const header = (
    <PageHeader
      title={
        lead
          ? `${lead.first_name} ${lead.last_name}`
          : data.kind === 'aasc_placement'
            ? 'AASC placement'
            : 'Tenancy'
      }
      description={
        property
          ? `${property.address_line_1}, ${property.city} ${property.postcode}${unit ? ` · ${unit.label}` : ''}`
          : undefined
      }
      actions={
        <>
          <Link
            href={`/properties/${data.property_id}?tab=tenancies`}
            className="text-sm font-medium text-muted-foreground hover:underline self-center"
          >
            ← Back to property
          </Link>
        </>
      }
    />
  )

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={data.kind} />
        <StatusBadge status={data.status} />
      </div>

      <TenancyActions tenancyId={data.id} canManage={canManage} status={data.status} />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-base font-medium">Dates</h3>
          <dl className="space-y-1.5 text-sm">
            <Row label="Start" rowValue={<DateDisplay date={data.start_date} />} />
            <Row label="Intended end" rowValue={<DateDisplay date={data.end_date_intended} />} />
            <Row label="Notice given" rowValue={<DateDisplay date={data.notice_given_at} />} />
            <Row label="Vacate date" rowValue={<DateDisplay date={data.vacate_date} />} />
            <Row label="Actual end" rowValue={<DateDisplay date={data.end_date} />} />
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-base font-medium">Financials</h3>
          <dl className="space-y-1.5 text-sm">
            <Row
              label="Rent"
              rowValue={
                <>
                  <MoneyDisplay pence={toBig(data.rent_pence)} /> / {data.rent_period}
                </>
              }
            />
            <Row label="≈ Monthly" rowValue={<MoneyDisplay pence={rentMonthly} />} />
            <Row label="≈ Annual" rowValue={<MoneyDisplay pence={rentAnnual} />} />
            <Row label="Deposit" rowValue={<MoneyDisplay pence={toOptBig(data.deposit_pence)} />} />
            <Row
              label="Scheme"
              rowValue={
                data.deposit_scheme
                  ? `${data.deposit_scheme}${data.deposit_scheme_ref ? ` · ${data.deposit_scheme_ref}` : ''}`
                  : '—'
              }
            />
          </dl>
        </section>

        <section className="sm:col-span-2">
          <h3 className="mb-2 text-base font-medium">Tenants</h3>
          {lead ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Right-to-rent</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">
                    {lead.first_name} {lead.last_name}
                  </TableCell>
                  <TableCell>{lead.email ?? '—'}</TableCell>
                  <TableCell>{lead.phone ?? '—'}</TableCell>
                  <TableCell>
                    {lead.right_to_rent_checked ? (
                      <>
                        Checked
                        {lead.right_to_rent_expiry && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (expires <DateDisplay date={lead.right_to_rent_expiry} />)
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-destructive">Not checked</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">Lead</TableCell>
                </TableRow>
                {joints.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>
                      {j.first_name} {j.last_name}
                    </TableCell>
                    <TableCell>{j.email ?? '—'}</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell className="text-xs text-muted-foreground">Joint</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tenant identity recorded (this is correct for AASC placements).
            </p>
          )}
        </section>

        <section className="sm:col-span-2">
          <h3 className="mb-2 text-base font-medium">Rent history</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rent changes recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective from</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <DateDisplay date={r.effective_from} />
                    </TableCell>
                    <TableCell className="text-sm">{r.reason.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay pence={toBig(r.new_rent_pence)} />
                    </TableCell>
                    <TableCell className="text-sm">{r.new_rent_period}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.notes ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {data.notes && (
          <section className="sm:col-span-2">
            <h3 className="mb-2 text-base font-medium">Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.notes}</p>
          </section>
        )}
      </div>
    </div>
  )
}

function Row({ label, rowValue }: { label: string; rowValue: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{rowValue ?? '—'}</dd>
    </div>
  )
}
