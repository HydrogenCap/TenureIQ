import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { recentCronRuns } from '@/lib/admin/cron-log'

export default async function CronLogPage() {
  // Owner-only. cron_run_log has RLS enabled with no policies, so even
  // members can't read it via the user-facing client. The admin helper
  // uses service-role.
  const auth = await requireOrgRole(['owner'])
  if (!auth.ok) redirect('/dashboard')

  const runs = await recentCronRuns(50)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cron log"
        description="Last 50 cron invocations across all jobs. Owner-only."
      />

      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No runs yet. The send-reminders cron fires every 10 minutes once the
          Vercel deployment is live.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Finished</TableHead>
              <TableHead className="text-right">Processed</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.job}</TableCell>
                <TableCell>
                  <StatusBadge
                    status={
                      r.status === 'running'
                        ? 'in_progress'
                        : r.status === 'failed'
                          ? 'expired'
                          : 'valid'
                    }
                  />
                </TableCell>
                <TableCell className="text-sm">
                  <DateDisplay date={r.startedAt} formatStr="d MMM HH:mm:ss" />
                </TableCell>
                <TableCell className="text-sm">
                  {r.finishedAt ? (
                    <DateDisplay date={r.finishedAt} formatStr="d MMM HH:mm:ss" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.processed}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.failed > 0 ? (
                    <span className="text-destructive">{r.failed}</span>
                  ) : (
                    r.failed
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.errorMessage ?? r.notes ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
