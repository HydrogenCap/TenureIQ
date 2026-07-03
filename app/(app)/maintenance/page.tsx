import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { slaBreached, daysOpen, type JobPriority } from '@/lib/domain/maintenance'
import type { BoardStatus } from '@/lib/schemas/maintenance'
import { KanbanBoard, type BoardJob, type BoardColumn } from './_components/kanban-board'

type DbRow = {
  id: string
  title: string
  kind: string
  priority: string
  status: string
  reported_at: string
  completed_at: string | null
  target_completion_date: string | null
  cost_pence: string | number | null
  property: Array<{ address_line_1: string; postcode: string }>
  contractor: Array<{ name: string }>
}

type BoardDbRow = {
  id: string
  title: string
  priority: string
  status: string
  property: Array<{ address_line_1: string; postcode: string }>
  contractor: Array<{ name: string }>
}

function toBig(v: string | number | null): bigint | null {
  if (v === null) return null
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

const BOARD_COLUMNS: Array<{ status: BoardStatus; label: string }> = [
  { status: 'reported', label: 'Reported' },
  { status: 'triaged', label: 'Triaged' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'awaiting_quote', label: 'Awaiting quote' },
  { status: 'completed', label: 'Completed' },
]

// Intermediate workflow states render inside the nearest board column
// (the card still shows its true status badge).
function columnOf(status: string): BoardStatus {
  switch (status) {
    case 'reported':
      return 'reported'
    case 'triaged':
      return 'triaged'
    case 'awaiting_quote':
    case 'quote_received':
      return 'awaiting_quote'
    case 'completed':
      return 'completed'
    default:
      // approved, scheduled, in_progress, awaiting_invoice
      return 'in_progress'
  }
}

function toBoardJob(r: BoardDbRow): BoardJob {
  return {
    id: r.id,
    title: r.title,
    priority: r.priority,
    status: r.status,
    addressLine1: r.property?.[0]?.address_line_1 ?? null,
    postcode: r.property?.[0]?.postcode ?? null,
    contractorName: r.contractor?.[0]?.name ?? null,
  }
}

export const metadata = { title: 'Maintenance' }

export default async function MaintenanceListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; ageing?: string; view?: string }>
}) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const { status, priority, ageing, view } = await searchParams

  const sb = await supabaseServer()

  if (view === 'board') {
    const boardSelect =
      'id, title, priority, status, property:properties(address_line_1, postcode), contractor:contractors!assigned_contractor_id(name)'
    const [openRes, completedRes] = await Promise.all([
      sb
        .from('maintenance_jobs')
        .select(boardSelect)
        .eq('organisation_id', auth.organisationId)
        .is('deleted_at', null)
        .not('status', 'in', '("completed","cancelled")')
        .order('reported_at', { ascending: false }),
      sb
        .from('maintenance_jobs')
        .select(boardSelect)
        .eq('organisation_id', auth.organisationId)
        .is('deleted_at', null)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(15),
    ])

    const openRows = (openRes.data ?? []) as BoardDbRow[]
    const completedRows = (completedRes.data ?? []) as BoardDbRow[]

    const grouped = new Map<BoardStatus, BoardJob[]>()
    for (const c of BOARD_COLUMNS) grouped.set(c.status, [])
    for (const r of openRows) grouped.get(columnOf(r.status))?.push(toBoardJob(r))
    for (const r of completedRows) grouped.get('completed')?.push(toBoardJob(r))

    const columns: BoardColumn[] = BOARD_COLUMNS.map((c) => ({
      status: c.status,
      label: c.label,
      jobs: grouped.get(c.status) ?? [],
    }))
    const total = openRows.length + completedRows.length

    return (
      <div className="space-y-6">
        <PageHeader
          title="Maintenance"
          description="Drag a card between columns to update its status. Completed shows the 15 most recent."
          actions={<HeaderActions view="board" />}
        />
        {total === 0 ? (
          <EmptyState
            title="No jobs yet"
            description="Report the first job for this org to start using the board."
            action={
              <Link href="/maintenance/new" className={buttonVariants()}>
                + Report a job
              </Link>
            }
          />
        ) : (
          <KanbanBoard columns={columns} />
        )}
      </div>
    )
  }

  let q = sb
    .from('maintenance_jobs')
    .select(
      'id, title, kind, priority, status, reported_at, completed_at, target_completion_date, cost_pence, property:properties(address_line_1, postcode), contractor:contractors!assigned_contractor_id(name)',
    )
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('reported_at', { ascending: false })

  if (status) q = q.eq('status', status)
  if (priority) q = q.eq('priority', priority)

  const { data: raw } = await q
  let rows = (raw ?? []) as DbRow[]

  const now = new Date()

  if (ageing === '7') {
    rows = rows.filter(
      (j) =>
        j.status !== 'completed' &&
        j.status !== 'cancelled' &&
        daysOpen({
          priority: j.priority as JobPriority,
          status: j.status,
          reportedAt: j.reported_at,
          completedAt: j.completed_at,
        }, now) >= 7,
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance"
        description="Jobs from reported through completion. Filter by status, priority, or ageing > 7 days."
        actions={<HeaderActions view="list" />}
      />

      <nav className="flex flex-wrap gap-2 text-sm">
        <FilterChip href="/maintenance" active={!status && !ageing}>
          All
        </FilterChip>
        <FilterChip href="/maintenance?status=reported" active={status === 'reported'}>
          Reported
        </FilterChip>
        <FilterChip href="/maintenance?status=in_progress" active={status === 'in_progress'}>
          In progress
        </FilterChip>
        <FilterChip
          href="/maintenance?status=awaiting_quote"
          active={status === 'awaiting_quote'}
        >
          Awaiting quote
        </FilterChip>
        <FilterChip
          href="/maintenance?status=completed"
          active={status === 'completed'}
        >
          Completed
        </FilterChip>
        <FilterChip href="/maintenance?ageing=7" active={ageing === '7'}>
          Ageing &gt; 7d
        </FilterChip>
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="No jobs match this filter"
          description="Try a different filter or report the first job for this org."
          action={
            <Link href="/maintenance/new" className={buttonVariants()}>
              + Report a job
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Contractor</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Days open</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((j) => {
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
                  <TableCell className="text-sm">
                    {j.property?.[0]?.address_line_1 ?? '—'}
                    <p className="text-xs text-muted-foreground">
                      {j.property?.[0]?.postcode ?? ''}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{j.contractor?.[0]?.name ?? '—'}</TableCell>
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
                  <TableCell className="text-right tabular-nums text-sm">
                    {j.status === 'completed' || j.status === 'cancelled' ? days : `${days}d`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {j.cost_pence !== null ? <MoneyDisplay pence={toBig(j.cost_pence)} /> : '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <p className="text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'job' : 'jobs'}
      </p>
    </div>
  )
}

function HeaderActions({ view }: { view: 'list' | 'board' }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-md border text-sm" role="group" aria-label="View">
        <Link
          href="/maintenance"
          className={
            view === 'list'
              ? 'bg-primary px-3 py-1.5 text-primary-foreground'
              : 'px-3 py-1.5 hover:bg-muted'
          }
        >
          List
        </Link>
        <Link
          href="/maintenance?view=board"
          className={
            view === 'board'
              ? 'bg-primary px-3 py-1.5 text-primary-foreground'
              : 'px-3 py-1.5 hover:bg-muted'
          }
        >
          Board
        </Link>
      </div>
      <Link href="/contractors" className={buttonVariants({ variant: 'outline' })}>
        Contractors
      </Link>
      <Link href="/maintenance/new" className={buttonVariants()}>
        + Report a job
      </Link>
    </div>
  )
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-md border bg-primary px-3 py-1 text-primary-foreground'
          : 'rounded-md border px-3 py-1 hover:bg-muted'
      }
    >
      {children}
    </Link>
  )
}
