// app/(app)/admin/webhook-events/page.tsx
// Owner-only diagnostic: recent inbound webhook events.
//
// webhook_events has RLS enabled with NO policies (service-role only).
// The lib/admin/webhook-events helper uses the service-role client.
// We surface the event id + type + processed-at + error message + a
// short payload preview; full inspection is in the Stripe dashboard.

import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'
import { KpiTile } from '@/components/kpi-tile'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { recentWebhookEvents, webhookEventStats } from '@/lib/admin/webhook-events'

export const dynamic = 'force-dynamic'

export default async function WebhookEventsPage() {
  const auth = await requireOrgRole(['owner'])
  if (!auth.ok) redirect('/dashboard')

  const [events, stats] = await Promise.all([
    recentWebhookEvents(100),
    webhookEventStats(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhook events"
        description="Last 100 inbound webhook deliveries. Owner-only. Full payloads are in the Stripe dashboard — we strip headers and only preview here."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="Total ever" display={stats.total} />
        <KpiTile label="Last 24h" display={stats.last24hCount} />
        <KpiTile
          label="Unprocessed"
          display={stats.unprocessed}
          sub={stats.unprocessed > 0 ? 'check the error column' : 'all caught up'}
          trend={stats.unprocessed > 0 ? 'down' : 'up'}
        />
        <KpiTile
          label="With errors"
          display={stats.failed}
          trend={stats.failed > 0 ? 'down' : 'flat'}
        />
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No webhook events recorded yet. The Stripe handler at{' '}
          <code>/api/webhooks/stripe</code> writes one row per delivery.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Processed</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => {
                const status: string = e.errorMessage
                  ? 'expired'
                  : e.processedAt
                    ? 'valid'
                    : 'in_progress'
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.eventId}</TableCell>
                    <TableCell className="text-sm">{e.eventType}</TableCell>
                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <DateDisplay date={e.createdAt} formatStr="d MMM HH:mm:ss" />
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.processedAt ? (
                        <DateDisplay date={e.processedAt} formatStr="d MMM HH:mm:ss" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      {e.errorMessage ? (
                        <span className="text-xs text-destructive">{e.errorMessage}</span>
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {e.payloadPreview}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
