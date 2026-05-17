// Property detail AASC tab — visible only when properties.is_aasc_property=true.

import Link from 'next/link'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { MoneyDisplay } from '@/components/money-display'
import { clearspringsMaxWeeklyPence } from '@/lib/domain/aasc'
import {
  placementGrossPerWeekPence,
  placementNetPerWeekPence,
} from '@/lib/domain/aasc-placement'
import { KpiTile } from '@/components/kpi-tile'

type PlacementRow = {
  id: string
  placement_ref: string
  status: string
  service_user_count: number
  weekly_rate_pence: string | number
  commission_rate_bps_override: number | null
  start_date: string
  end_date: string | null
  contract: Array<{ id: string; contractor: string; commission_rate_bps: number }>
}

type LhaRow = { weekly_pence: string | number; effective_from: string; effective_to: string | null }

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export async function AascTab({ propertyId }: { propertyId: string }) {
  const auth = await requireOrgMember()
  if (!auth.ok) return null

  const sb = await supabaseServer()

  // Property — we need brma_code for the LHA SAR.
  const { data: prop } = await sb
    .from('properties')
    .select('id, brma_code')
    .eq('id', propertyId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; brma_code: string | null }>()

  const { data: rawPlacements } = await sb
    .from('aasc_placements')
    .select(
      'id, placement_ref, status, service_user_count, weekly_rate_pence, commission_rate_bps_override, start_date, end_date, contract:aasc_contracts(id, contractor, commission_rate_bps)',
    )
    .eq('property_id', propertyId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })

  const placements = (rawPlacements ?? []) as PlacementRow[]

  // LHA SAR lookup for the BRMA — read-only reference next to the rate.
  let sarPence: bigint | null = null
  if (prop?.brma_code) {
    const { data: rates } = await sb
      .from('lha_rates')
      .select('weekly_pence, effective_from, effective_to')
      .eq('brma_code', prop.brma_code)
      .eq('beds', 'SAR')
    const today = new Date()
    for (const r of (rates ?? []) as LhaRow[]) {
      const from = new Date(r.effective_from)
      const to = r.effective_to ? new Date(r.effective_to) : null
      if (from <= today && (to === null || today < to)) {
        sarPence = toBig(r.weekly_pence)
        break
      }
    }
  }

  const active = placements.filter((p) => p.status === 'active')
  const totalSUs = active.reduce((n, p) => n + p.service_user_count, 0)
  const grossWeekly = active.reduce(
    (s, p) =>
      s +
      placementGrossPerWeekPence({
        weeklyRatePence: toBig(p.weekly_rate_pence),
        serviceUserCount: p.service_user_count,
      }),
    0n,
  )
  const netWeekly = active.reduce(
    (s, p) =>
      s +
      placementNetPerWeekPence({
        weeklyRatePence: toBig(p.weekly_rate_pence),
        serviceUserCount: p.service_user_count,
        commissionRateBpsOverride: p.commission_rate_bps_override,
        contractCommissionRateBps: p.contract?.[0]?.commission_rate_bps ?? 0,
      }),
    0n,
  )

  if (placements.length === 0) {
    return (
      <EmptyState
        title="No AASC placements on this property"
        description="Create a placement to start tracking dispersal accommodation. The form will pre-select this property."
        action={
          <Link
            href={`/aasc/placements/new?propertyId=${propertyId}`}
            className={buttonVariants()}
          >
            + New placement
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile label="Service users (live)" display={totalSUs} />
        <KpiTile label="Gross / week" display={<MoneyDisplay pence={grossWeekly} />} />
        <KpiTile label="Net / week" display={<MoneyDisplay pence={netWeekly} />} />
        <KpiTile
          label="Annualised net"
          display={<MoneyDisplay pence={netWeekly * 52n} />}
        />
      </div>

      {sarPence !== null && (
        <div className="rounded-md border bg-card p-4 text-sm">
          <p>
            <span className="text-muted-foreground">LHA SAR (this BRMA):</span>{' '}
            <MoneyDisplay pence={sarPence} /> / week
          </p>
          <p>
            <span className="text-muted-foreground">Clearsprings ceiling:</span>{' '}
            <MoneyDisplay pence={clearspringsMaxWeeklyPence(sarPence)} /> / week (× 1.40)
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-medium">Placements ({placements.length})</h3>
        <Link
          href={`/aasc/placements/new?propertyId=${propertyId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          + New placement
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Contractor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">SUs</TableHead>
            <TableHead className="text-right">£/week</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {placements.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-xs">
                <Link href={`/aasc/placements/${p.id}`} className="hover:underline">
                  {p.placement_ref}
                </Link>
              </TableCell>
              <TableCell className="text-sm capitalize">
                {p.contract?.[0]?.contractor ?? '—'}
              </TableCell>
              <TableCell>
                <StatusBadge status={p.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {p.service_user_count}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <MoneyDisplay pence={toBig(p.weekly_rate_pence)} />
              </TableCell>
              <TableCell className="text-sm">
                <DateDisplay date={p.start_date} />
              </TableCell>
              <TableCell className="text-sm">
                {p.end_date ? <DateDisplay date={p.end_date} /> : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
