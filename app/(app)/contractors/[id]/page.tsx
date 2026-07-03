import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { KpiTile } from '@/components/kpi-tile'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { MoneyDisplay } from '@/components/money-display'
import { buttonVariants } from '@/components/ui/button'

type DbRow = {
  id: string
  name: string
  kind: string
  contact_name: string | null
  phone: string | null
  email: string | null
  insurance_expiry: string | null
  accreditations: string[]
  notes: string | null
}

type JobRow = {
  id: string
  title: string
  status: string
  priority: string
  reported_at: string
  cost_pence: string | number | null
}

type InvoiceRow = {
  id: string
  amount_pence: string | number
  vat_pence: string | number
  invoice_date: string
  paid_at: string | null
}

function toBig(v: string | number | null): bigint {
  if (v === null) return 0n
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function ContractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data } = await sb
    .from('contractors')
    .select(
      'id, name, kind, contact_name, phone, email, insurance_expiry, accreditations, notes',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  const [jobsRes, invoicesRes] = await Promise.all([
    sb
      .from('maintenance_jobs')
      .select('id, title, status, priority, reported_at, cost_pence')
      .eq('assigned_contractor_id', id)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('reported_at', { ascending: false })
      .limit(50),
    sb
      .from('maintenance_invoices')
      .select('id, amount_pence, vat_pence, invoice_date, paid_at')
      .eq('contractor_id', id)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false }),
  ])

  const jobs = (jobsRes.data ?? []) as JobRow[]
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[]

  const totalInvoicedPence = invoices.reduce(
    (sum, inv) => sum + toBig(inv.amount_pence) + toBig(inv.vat_pence),
    0n,
  )
  const totalPaidPence = invoices
    .filter((inv) => inv.paid_at !== null)
    .reduce((sum, inv) => sum + toBig(inv.amount_pence) + toBig(inv.vat_pence), 0n)

  const insExpired =
    data.insurance_expiry !== null && new Date(data.insurance_expiry) < new Date()
  const canManage =
    auth.role === 'owner' || auth.role === 'admin' || auth.role === 'manager'

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.name}
        description={`${data.kind.replace(/_/g, ' ')}${data.contact_name ? ` · ${data.contact_name}` : ''}`}
        actions={
          canManage && (
            <Link
              href={`/contractors/${id}/edit`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Edit
            </Link>
          )
        }
      />

      {insExpired && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          ⚠ Insurance expired ({data.insurance_expiry}). Don&apos;t assign new jobs until renewed.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile label="Total jobs" display={jobs.length} />
        <KpiTile
          label="Total invoiced"
          display={<MoneyDisplay pence={totalInvoicedPence} />}
        />
        <KpiTile label="Total paid" display={<MoneyDisplay pence={totalPaidPence} />} />
        <KpiTile
          label="Insurance"
          display={
            data.insurance_expiry ? <DateDisplay date={data.insurance_expiry} /> : '—'
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email" display={data.email ?? '—'} />
        <Field label="Phone" display={data.phone ?? '—'} />
        <Field
          label="Accreditations"
          display={data.accreditations.join(', ') || '—'}
        />
      </div>

      {data.notes && (
        <section>
          <h3 className="mb-1 text-base font-medium">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.notes}</p>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-base font-medium">Recent jobs</h3>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs assigned yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-medium">
                    <Link href={`/maintenance/${j.id}`} className="hover:underline">
                      {j.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={j.priority} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={j.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    <DateDisplay date={j.reported_at} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {j.cost_pence !== null ? <MoneyDisplay pence={toBig(j.cost_pence)} /> : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

function Field({ label, display }: { label: string; display: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{display}</p>
    </div>
  )
}
