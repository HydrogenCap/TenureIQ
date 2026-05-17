import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { MoneyDisplay } from '@/components/money-display'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { slaBreached, slaWindowHours, daysOpen, type JobPriority } from '@/lib/domain/maintenance'
import { JobActionsPanel } from './_components/job-actions-panel'

type DbRow = {
  id: string
  title: string
  description: string | null
  kind: string
  priority: string
  status: string
  reported_at: string
  reported_date: string
  target_completion_date: string | null
  completed_at: string | null
  cost_pence: string | number | null
  property: Array<{ id: string; address_line_1: string; postcode: string }>
  unit: Array<{ label: string }>
  contractor: Array<{ id: string; name: string }>
}

type EventRow = {
  id: string
  kind: string
  body: string | null
  metadata: Record<string, unknown>
  created_at: string
  actor_user_id: string | null
}

type QuoteRow = {
  id: string
  amount_pence: string | number
  validity_until: string | null
  received_at: string
  status: string
  notes: string | null
  contractor: Array<{ id: string; name: string }>
}

type InvoiceRow = {
  id: string
  amount_pence: string | number
  vat_pence: string | number
  invoice_number: string
  invoice_date: string
  paid_at: string | null
  contractor: Array<{ name: string }>
}

function toBig(v: string | number | null): bigint | null {
  if (v === null) return null
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data } = await sb
    .from('maintenance_jobs')
    .select(
      'id, title, description, kind, priority, status, reported_at, reported_date, target_completion_date, completed_at, cost_pence, property:properties(id, address_line_1, postcode), unit:units(label), contractor:contractors!assigned_contractor_id(id, name)',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  const [eventsRes, quotesRes, invoicesRes, contractorsRes] = await Promise.all([
    sb
      .from('maintenance_job_events')
      .select('id, kind, body, metadata, created_at, actor_user_id')
      .eq('job_id', id)
      .eq('organisation_id', auth.organisationId)
      .order('created_at', { ascending: false })
      .limit(100),
    sb
      .from('maintenance_quotes')
      .select(
        'id, amount_pence, validity_until, received_at, status, notes, contractor:contractors(id, name)',
      )
      .eq('job_id', id)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('received_at', { ascending: false }),
    sb
      .from('maintenance_invoices')
      .select(
        'id, amount_pence, vat_pence, invoice_number, invoice_date, paid_at, contractor:contractors(name)',
      )
      .eq('job_id', id)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false }),
    sb
      .from('contractors')
      .select('id, name')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('name'),
  ])

  const events = (eventsRes.data ?? []) as EventRow[]
  const quotes = (quotesRes.data ?? []) as QuoteRow[]
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[]
  const contractors = (contractorsRes.data ?? []) as Array<{ id: string; name: string }>

  const property = data.property?.[0]
  const unit = data.unit?.[0]
  const contractor = data.contractor?.[0]
  const canManage =
    auth.role === 'owner' || auth.role === 'admin' || auth.role === 'manager'

  const now = new Date()
  const jobLike = {
    priority: data.priority as JobPriority,
    status: data.status,
    reportedAt: data.reported_at,
    completedAt: data.completed_at,
  }
  const breached = slaBreached(jobLike, now)
  const days = daysOpen(jobLike, now)

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.title}
        description={
          property
            ? `${property.address_line_1}, ${property.postcode}${unit ? ` · ${unit.label}` : ''}`
            : undefined
        }
        actions={
          <Link
            href="/maintenance"
            className="self-center text-sm font-medium text-muted-foreground hover:underline"
          >
            ← Maintenance
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={data.kind} />
        <StatusBadge status={data.priority} />
        <StatusBadge status={data.status} />
        {breached && (
          <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
            SLA breached ({days}d, target {(slaWindowHours(jobLike.priority) / 24).toFixed(0)}d)
          </span>
        )}
        {contractor && (
          <Link
            href={`/contractors/${contractor.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {contractor.name} →
          </Link>
        )}
      </div>

      <JobActionsPanel
        jobId={data.id}
        status={data.status}
        canManage={canManage}
        contractors={contractors}
      />

      {data.description && (
        <section>
          <h3 className="mb-1 text-sm font-medium">Description</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.description}</p>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Field label="Reported" display={<DateDisplay date={data.reported_at} />} />
        <Field
          label="Target"
          display={
            data.target_completion_date ? (
              <DateDisplay date={data.target_completion_date} />
            ) : (
              '—'
            )
          }
        />
        <Field
          label="Completed"
          display={data.completed_at ? <DateDisplay date={data.completed_at} /> : '—'}
        />
        <Field
          label="Cost"
          display={data.cost_pence !== null ? <MoneyDisplay pence={toBig(data.cost_pence)} /> : '—'}
        />
      </div>

      <section>
        <h3 className="mb-2 text-base font-medium">Quotes ({quotes.length})</h3>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quotes recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contractor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Valid until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">
                    {q.contractor?.[0]?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toBig(q.amount_pence)} />
                  </TableCell>
                  <TableCell className="text-sm">
                    <DateDisplay date={q.received_at} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {q.validity_until ? <DateDisplay date={q.validity_until} /> : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={q.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {q.notes ?? ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-base font-medium">Invoices ({invoices.length})</h3>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contractor</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    {inv.contractor?.[0]?.name ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                  <TableCell className="text-sm">
                    <DateDisplay date={inv.invoice_date} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toBig(inv.amount_pence)} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toBig(inv.vat_pence)} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {inv.paid_at ? <DateDisplay date={inv.paid_at} /> : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-base font-medium">Timeline</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm">
                    <StatusBadge status={e.kind} className="text-[10px]" />{' '}
                    {e.body && <span className="ml-2">{e.body}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <DateDisplay date={e.created_at} formatStr="d MMM yyyy HH:mm" />
                  </p>
                </div>
              </li>
            ))}
          </ul>
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
