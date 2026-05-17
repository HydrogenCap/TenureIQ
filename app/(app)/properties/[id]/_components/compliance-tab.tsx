// Property detail Compliance tab — items for this property + rollup +
// next expiring. Server component.

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { EmptyState } from '@/components/empty-state'
import { KpiTile } from '@/components/kpi-tile'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { complianceStatus } from '@/lib/domain/compliance'
import { complianceRollup, nextExpiringItem } from '@/lib/domain/compliance-rollup'

type DbRow = {
  id: string
  kind: string
  status: string
  issue_date: string | null
  expiry_date: string | null
  issuer: string | null
}

export async function ComplianceTab({ propertyId }: { propertyId: string }) {
  const auth = await requireOrgMember()
  if (!auth.ok) return null

  const sb = await supabaseServer()
  const { data: raw } = await sb
    .from('compliance_items')
    .select('id, kind, status, issue_date, expiry_date, issuer')
    .eq('property_id', propertyId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('expiry_date', { ascending: true, nullsFirst: true })

  const items = (raw ?? []) as DbRow[]

  if (items.length === 0) {
    return (
      <EmptyState
        title="No certificates recorded"
        description="Once you record gas-safety, EICR, EPC, fire-risk-assessment etc. they appear here with status + expiry."
        action={
          <Link
            href={`/compliance/new?propertyId=${propertyId}`}
            className={buttonVariants()}
          >
            + Record certificate
          </Link>
        }
      />
    )
  }

  // Recompute live status (vs. stored — may be stale relative to today)
  // and rename to camelCase so the domain helpers can consume it.
  const live = items.map((i) => ({
    id: i.id,
    kind: i.kind,
    issuer: i.issuer,
    issueDate: i.issue_date,
    expiryDate: i.expiry_date,
    status:
      i.status === 'exempt' ? 'exempt' : complianceStatus(i.expiry_date),
  }))

  const rollup = complianceRollup(live)
  const next = nextExpiringItem(live)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile label="Valid" display={rollup.valid} trend={rollup.valid > 0 ? 'up' : 'flat'} />
        <KpiTile
          label="Expiring (≤60d)"
          display={rollup.expiring}
          trend={rollup.expiring > 0 ? 'down' : 'flat'}
        />
        <KpiTile
          label="Expired"
          display={rollup.expired}
          trend={rollup.expired > 0 ? 'down' : 'flat'}
        />
        <KpiTile label="Exempt" display={rollup.exempt ?? 0} />
      </div>

      {next && (
        <div className="rounded-md border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Next expiring</p>
          <p className="mt-1 text-base font-medium">
            <StatusBadge status={next.kind} /> ·{' '}
            <DateDisplay date={next.expiryDate} /> ·{' '}
            <span className="text-sm text-muted-foreground">
              <DateDisplay date={next.expiryDate} distance />
            </span>
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? 'certificate' : 'certificates'}
        </p>
        <Link
          href={`/compliance/new?propertyId=${propertyId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          + Record certificate
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Issuer</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {live.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="font-medium">
                <Link href={`/compliance/${i.id}`} className="hover:underline">
                  {i.kind.replace(/_/g, ' ')}
                </Link>
              </TableCell>
              <TableCell>
                <StatusBadge status={i.status} />
              </TableCell>
              <TableCell className="text-sm">
                {i.issueDate ? <DateDisplay date={i.issueDate} /> : '—'}
              </TableCell>
              <TableCell className="text-sm">
                {i.expiryDate ? (
                  <>
                    <DateDisplay date={i.expiryDate} />
                    <p className="text-xs text-muted-foreground">
                      <DateDisplay date={i.expiryDate} distance />
                    </p>
                  </>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-sm">{i.issuer ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
