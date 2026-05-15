// Tab body listing tenancies for a property, with a simple CSS-grid
// timeline visualisation (Recharts is overkill for this).

import Link from 'next/link'
import { supabaseServer } from '@/lib/db/user'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { monthlyRentPence, type RentPeriod } from '@/lib/domain/rent'

type TenancyDbRow = {
  id: string
  kind: string
  status: string
  start_date: string
  end_date: string | null
  end_date_intended: string | null
  rent_pence: string | number
  rent_period: string
  unit: Array<{ label: string }>
  tenant: Array<{ first_name: string; last_name: string }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export async function TenanciesTab({ propertyId }: { propertyId: string }) {
  const sb = await supabaseServer()

  const { data: rawTenancies } = await sb
    .from('tenancies')
    .select(
      'id, kind, status, start_date, end_date, end_date_intended, rent_pence, rent_period, unit:units(label), tenant:tenants(first_name, last_name)',
    )
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })

  const tenancies = (rawTenancies ?? []) as TenancyDbRow[]

  if (tenancies.length === 0) {
    return (
      <EmptyState
        title="No tenancies yet"
        description="Once you let this property, tenancies appear here with their dates, rent, and current tenants."
        action={
          <Link
            href={`/tenancies/new?propertyId=${propertyId}`}
            className={buttonVariants()}
          >
            + New tenancy
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {tenancies.length} {tenancies.length === 1 ? 'tenancy' : 'tenancies'} total
        </p>
        <Link
          href={`/tenancies/new?propertyId=${propertyId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          + New tenancy
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tenant / placement</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead className="text-right">Rent / month</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenancies.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">
                <Link href={`/tenancies/${t.id}`} className="hover:underline">
                  {t.tenant?.[0]
                    ? `${t.tenant[0].first_name} ${t.tenant[0].last_name}`
                    : t.kind === 'aasc_placement'
                      ? 'AASC placement'
                      : '—'}
                </Link>
              </TableCell>
              <TableCell className="text-sm">{t.unit?.[0]?.label ?? '—'}</TableCell>
              <TableCell>
                <StatusBadge status={t.kind} />
              </TableCell>
              <TableCell>
                <StatusBadge status={t.status} />
              </TableCell>
              <TableCell className="text-sm">
                <DateDisplay date={t.start_date} />
              </TableCell>
              <TableCell className="text-sm">
                {t.end_date ? (
                  <DateDisplay date={t.end_date} />
                ) : t.end_date_intended ? (
                  <span className="text-muted-foreground">
                    <DateDisplay date={t.end_date_intended} /> (intended)
                  </span>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <MoneyDisplay
                  pence={monthlyRentPence(toBig(t.rent_pence), t.rent_period as RentPeriod)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
