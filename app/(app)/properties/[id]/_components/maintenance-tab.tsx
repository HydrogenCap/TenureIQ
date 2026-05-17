// Property detail Maintenance tab.

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { EmptyState } from '@/components/empty-state'
import { KpiTile } from '@/components/kpi-tile'
import { MoneyDisplay } from '@/components/money-display'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import {
  slaBreached,
  daysOpen,
  last12MonthsSpendPence,
  type JobPriority,
} from '@/lib/domain/maintenance'

type JobRow = {
  id: string
  title: string
  kind: string
  priority: string
  status: string
  reported_at: string
  completed_at: string | null
  cost_pence: string | number | null
  contractor: Array<{ name: string }>
}
type InvoiceRow = {
  amount_pence: string | number
  vat_pence: string | number
  invoice_date: string
}

function toBig(v: string | number | null): bigint {
  if (v === null) return 0n
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export async function MaintenanceTab({ propertyId }: { propertyId: string }) {
  const auth = await requireOrgMember()
  if (!auth.ok) return null

  const sb = await supabaseServer()
  const [jobsRes, invoicesRes] = await Promise.all([
    sb
      .from('maintenance_jobs')
      .select(
        'id, title, kind, priority, status, reported_at, completed_at, cost_pence, contractor:contractors!assigned_contractor_id(name)',
      )
      .eq('property_id', propertyId)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('reported_at', { ascending: false }),
    sb
      .from('maintenance_invoices')
      .select('amount_pence, vat_pence, invoice_date, job:maintenance_jobs!inner(property_id)')
      .eq('organisation_id', auth.organisationId)
      .eq('job.property_id', propertyId)
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false }),
  ])

  const jobs = (jobsRes.data ?? []) as JobRow[]
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[]
  const now = new Date()

  const openJobs = jobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled')
  const spend12mPence = last12MonthsSpendPence(
    invoices.map((i) => ({
      amountPence: toBig(i.amount_pence),
      vatPence: toBig(i.vat_pence),
      invoiceDate: i.invoice_date,
    })),
    now,
  )

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No maintenance recorded"
        description="Report the first job — gas-safety, repairs, callouts, anything you'd want a record of."
        action={
          <Link
            href={`/maintenance/new?propertyId=${propertyId}`}
            className={buttonVariants()}
          >
            + Report a job
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiTile label="Open jobs" display={openJobs.length} />
        <KpiTile label="All-time jobs" display={jobs.length} />
        <KpiTile
          label="12-month spend"
          display={<MoneyDisplay pence={spend12mPence} />}
          sub="Inclusive of VAT"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}</p>
        <Link
          href={`/maintenance/new?propertyId=${propertyId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          + Report a job
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Contractor</TableHead>
            <TableHead>Reported</TableHead>
            <TableHead className="text-right">Days open</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((j) => {
            const jobLike = {
              priority: j.priority as JobPriority,
              status: j.status,
              reportedAt: j.reported_at,
              completedAt: j.completed_at,
            }
            const breached = slaBreached(jobLike, now)
            const days = daysOpen(jobLike, now)
            return (
              <TableRow key={j.id}>
                <TableCell className="font-medium">
                  <Link href={`/maintenance/${j.id}`} className="hover:underline">
                    {j.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{j.kind.replace(/_/g, ' ')}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={j.priority} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={j.status} />
                    {breached && (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                        SLA
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{j.contractor?.[0]?.name ?? '—'}</TableCell>
                <TableCell className="text-sm">
                  <DateDisplay date={j.reported_at} />
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">{days}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {j.cost_pence !== null ? <MoneyDisplay pence={toBig(j.cost_pence)} /> : '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
