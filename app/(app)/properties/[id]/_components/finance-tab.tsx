// Property detail Finance tab — mortgages + valuations + the "Add
// valuation" inline form. Server component.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { EmptyState } from '@/components/empty-state'
import { KpiTile } from '@/components/kpi-tile'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { bpsToPercent } from '@/lib/money'
import { ltvBps, stressedLtvBps } from '@/lib/domain/equity'
import { icr } from '@/lib/domain/icr'
import { monthlyRentPence, type RentPeriod } from '@/lib/domain/rent'
import { AddValuationForm } from './add-valuation-form'

type MortgageRow = {
  id: string
  lender: string
  product: string
  current_balance_pence: string | number
  interest_rate_bps: number
  fixed_end_date: string | null
  is_interest_only: boolean
}

type ValuationRow = {
  id: string
  valuation_date: string
  value_pence: string | number
  kind: string
  source: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

type PropertyRow = {
  current_valuation_pence: string | number | null
  purchase_price_pence: string | number
}

type TenancyRow = {
  status: string
  rent_pence: string | number
  rent_period: string
}

export async function FinanceTab({ propertyId }: { propertyId: string }) {
  // Re-derive auth context — this tab is a server component that's
  // routable on its own and shouldn't trust an external `organisationId`
  // prop. Convention #11 belt-and-braces: every read filters by
  // organisationId AND deleted_at explicitly in addition to RLS.
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()

  const [mortgagesRes, valuationsRes, propertyRes, tenanciesRes] = await Promise.all([
    sb
      .from('mortgages')
      .select(
        'id, lender, product, current_balance_pence, interest_rate_bps, fixed_end_date, is_interest_only',
      )
      .eq('property_id', propertyId)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null),
    sb
      .from('valuations')
      .select('id, valuation_date, value_pence, kind, source')
      .eq('property_id', propertyId)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('valuation_date', { ascending: false })
      .limit(20),
    sb
      .from('properties')
      .select('current_valuation_pence, purchase_price_pence')
      .eq('id', propertyId)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .maybeSingle<PropertyRow>(),
    sb
      .from('tenancies')
      .select('status, rent_pence, rent_period')
      .eq('property_id', propertyId)
      .eq('organisation_id', auth.organisationId)
      .eq('status', 'active')
      .is('deleted_at', null),
  ])

  const mortgages = (mortgagesRes.data ?? []) as MortgageRow[]
  const valuations = (valuationsRes.data ?? []) as ValuationRow[]
  const property = propertyRes.data
  const tenancies = (tenanciesRes.data ?? []) as TenancyRow[]

  // Compute the stress block. The 200-bps stress is "valuation falls
  // 20%" per CLAUDE.md's convention; the ICR check uses pay-rate stressed
  // by 200bps with a floor of 5.50% per PRA, 5+ year fixes excepted.
  const totalDebt = mortgages.reduce(
    (s, m) => s + toBig(m.current_balance_pence),
    0n,
  )
  const monthlyRentRoll = tenancies.reduce(
    (s, t) => s + monthlyRentPence(toBig(t.rent_pence), t.rent_period as RentPeriod),
    0n,
  )
  const valuePence =
    property?.current_valuation_pence !== null && property?.current_valuation_pence !== undefined
      ? toBig(property.current_valuation_pence)
      : property
        ? toBig(property.purchase_price_pence)
        : 0n

  const currentLtv =
    valuePence === 0n
      ? null
      : ltvBps({ valuationPence: valuePence, balancePence: totalDebt })
  const stressed20pct =
    valuePence === 0n
      ? null
      : stressedLtvBps({ valuationPence: valuePence, balancePence: totalDebt, stressBps: 2000 })

  // ICR: use the average pay rate weighted by balance (closest single
  // number; multi-mortgage properties are uncommon at this stage). For
  // the BTL stress test assume 2-year fix, individual_higher (most
  // conservative threshold).
  const weightedRateBps =
    totalDebt === 0n
      ? 0
      : Number(
          mortgages.reduce(
            (acc, m) =>
              acc + BigInt(m.interest_rate_bps) * toBig(m.current_balance_pence),
            0n,
          ) / totalDebt,
        )
  const icrResult =
    totalDebt === 0n || monthlyRentRoll === 0n
      ? null
      : icr({
          monthlyRentPence: monthlyRentRoll,
          balancePence: totalDebt,
          payRateBps: weightedRateBps,
          productYears: 2,
          borrowerKind: 'individual_higher',
        })

  return (
    <div className="space-y-8">
      {totalDebt > 0n && (
        <section>
          <h3 className="mb-3 text-base font-medium">Stress test</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="LTV (current)"
              display={currentLtv === null ? '—' : bpsToPercent(currentLtv)}
            />
            <KpiTile
              label="LTV (−20% value)"
              display={stressed20pct === null ? '—' : bpsToPercent(stressed20pct)}
              sub="20% valuation decline scenario"
              trend={stressed20pct !== null && stressed20pct >= 8500 ? 'down' : 'flat'}
            />
            <KpiTile
              label="ICR (stressed)"
              display={
                icrResult === null
                  ? '—'
                  : `${(icrResult.ratio).toFixed(2)}×`
              }
              sub={
                icrResult === null
                  ? 'needs rent + debt'
                  : icrResult.passes
                    ? `passes ${icrResult.thresholdRatio.toFixed(2)}× threshold`
                    : `fails ${icrResult.thresholdRatio.toFixed(2)}× threshold`
              }
              trend={icrResult === null ? 'flat' : icrResult.passes ? 'up' : 'down'}
            />
            <KpiTile
              label="Stressed monthly interest"
              display={
                icrResult === null ? (
                  '—'
                ) : (
                  <MoneyDisplay pence={icrResult.monthlyInterestStressedPence} />
                )
              }
              sub={
                icrResult === null
                  ? undefined
                  : `at ${bpsToPercent(icrResult.stressBps)} stress rate`
              }
            />
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-medium">Mortgages ({mortgages.length})</h3>
          <Link
            href={`/mortgages/new?propertyId=${propertyId}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            + New mortgage
          </Link>
        </div>
        {mortgages.length === 0 ? (
          <EmptyState
            title="No mortgages on this property"
            description="Owned outright — or just not yet recorded."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lender / product</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Fixed end</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mortgages.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.lender}
                    <p className="text-xs text-muted-foreground">
                      <StatusBadge status={m.product} className="text-[10px]" />
                      {m.is_interest_only && <span className="ml-1">· IO</span>}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toBig(m.current_balance_pence)} />
                  </TableCell>
                  <TableCell className="tabular-nums">{bpsToPercent(m.interest_rate_bps)}</TableCell>
                  <TableCell className="text-sm">
                    {m.fixed_end_date ? <DateDisplay date={m.fixed_end_date} /> : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/mortgages/${m.id}`}
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

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-medium">Valuations ({valuations.length})</h3>
        </div>

        <AddValuationForm propertyId={propertyId} />

        <div className="mt-4">
          {valuations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No valuations recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuations.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <DateDisplay date={v.valuation_date} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={v.kind} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay pence={toBig(v.value_pence)} />
                    </TableCell>
                    <TableCell className="text-sm">{v.source ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  )
}
