// app/(app)/aasc/page.tsx — AASC overview hub.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { KpiTile } from '@/components/kpi-tile'
import { MoneyDisplay } from '@/components/money-display'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import {
  placementGrossPerWeekPence,
  propertyAascRevenueAnnualPence,
} from '@/lib/domain/aasc-placement'

type ContractRow = {
  id: string
  contractor: string
  status: string
  start_date: string
  end_date: string | null
  break_clause_date: string | null
  commission_rate_bps: number
}
type PlacementRow = {
  id: string
  contract_id: string | null
  property_id: string
  status: string
  service_user_count: number
  weekly_rate_pence: string | number
  commission_rate_bps_override: number | null
  end_date: string | null
  property: Array<{ address_line_1: string; postcode: string }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function AascOverviewPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const [contractsRes, placementsRes] = await Promise.all([
    sb
      .from('aasc_contracts')
      .select('id, contractor, status, start_date, end_date, break_clause_date, commission_rate_bps')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('start_date', { ascending: false }),
    sb
      .from('aasc_placements')
      .select(
        'id, contract_id, property_id, status, service_user_count, weekly_rate_pence, commission_rate_bps_override, end_date, property:properties(address_line_1, postcode)',
      )
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('start_date', { ascending: false }),
  ])

  const contracts = (contractsRes.data ?? []) as ContractRow[]
  const placements = (placementsRes.data ?? []) as PlacementRow[]

  const commissionByContract = new Map<string, number>()
  for (const c of contracts) commissionByContract.set(c.id, c.commission_rate_bps)

  const activePlacements = placements.filter((p) => p.status === 'active')
  const totalServiceUsers = activePlacements.reduce(
    (n, p) => n + p.service_user_count,
    0,
  )
  const annualGrossPence = activePlacements.reduce(
    (sum, p) =>
      sum +
      placementGrossPerWeekPence({
        weeklyRatePence: toBig(p.weekly_rate_pence),
        serviceUserCount: p.service_user_count,
      }) *
        52n,
    0n,
  )

  // Annual net (after commission), summed across all active placements.
  const annualNetPence = (() => {
    let s = 0n
    for (const p of activePlacements) {
      const commission = commissionByContract.get(p.contract_id ?? '') ?? 0
      s += propertyAascRevenueAnnualPence({
        placements: [
          {
            weeklyRatePence: toBig(p.weekly_rate_pence),
            serviceUserCount: p.service_user_count,
            commissionRateBpsOverride: p.commission_rate_bps_override,
            endDateActual: p.end_date,
          },
        ],
        contractCommissionRateBps: commission,
      })
    }
    return s
  })()

  // Next break-clause date across active contracts.
  const nextBreak = contracts
    .filter((c) => c.status === 'active' && c.break_clause_date !== null)
    .map((c) => c.break_clause_date as string)
    .sort()[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title="AASC"
        description="Asylum accommodation contracts + placements. No service-user identity is stored or surfaced anywhere — this entire module enforces that rule."
        actions={
          <div className="flex gap-2">
            <Link
              href="/aasc/contracts"
              className={buttonVariants({ variant: 'outline' })}
            >
              Contracts
            </Link>
            <Link
              href="/aasc/placements"
              className={buttonVariants({ variant: 'outline' })}
            >
              Placements
            </Link>
            <Link href="/aasc/areas" className={buttonVariants({ variant: 'outline' })}>
              Areas
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile label="Active placements" display={activePlacements.length} />
        <KpiTile label="Service users" display={totalServiceUsers} />
        <KpiTile
          label="Annual gross"
          display={<MoneyDisplay pence={annualGrossPence} />}
          sub={
            <>
              Net: <MoneyDisplay pence={annualNetPence} />
            </>
          }
        />
        <KpiTile
          label="Next break clause"
          display={nextBreak ? <DateDisplay date={nextBreak} /> : '—'}
        />
      </div>

      <section>
        <h2 className="mb-2 text-base font-medium">Active placements</h2>
        {activePlacements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active placements.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead className="text-right">Service users</TableHead>
                <TableHead className="text-right">£/week</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activePlacements.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.property?.[0]?.address_line_1 ?? '—'}
                    <p className="text-xs text-muted-foreground">
                      {p.property?.[0]?.postcode ?? ''}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.service_user_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toBig(p.weekly_rate_pence)} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/aasc/placements/${p.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open →
                    </Link>
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
