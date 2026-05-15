// app/(app)/tenancies/page.tsx — global tenancies list.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { TenanciesTable, type TenancyRow } from './_components/tenancies-table'
import { monthlyRentPence, type RentPeriod } from '@/lib/domain/rent'

type DbRow = {
  id: string
  property_id: string
  kind: string
  status: string
  start_date: string
  end_date: string | null
  rent_pence: string | number
  rent_period: string
  unit: Array<{ label: string }>
  property: Array<{ address_line_1: string; postcode: string }>
  tenant: Array<{ first_name: string; last_name: string }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function TenanciesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; property?: string; entity?: string }>
}) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const { status, property, entity } = await searchParams

  const sb = await supabaseServer()
  let query = sb
    .from('tenancies')
    .select(
      'id, property_id, kind, status, start_date, end_date, rent_pence, rent_period, unit:units(label), property:properties(address_line_1, postcode), tenant:tenants(first_name, last_name)',
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: false })

  if (status) query = query.eq('status', status)
  if (property) query = query.eq('property_id', property)

  // Filter by entity by first finding its properties — RLS handles the org scope.
  if (entity) {
    const { data: entityProps } = await sb
      .from('properties')
      .select('id')
      .eq('entity_id', entity)
      .is('deleted_at', null)
    const ids = ((entityProps ?? []) as Array<{ id: string }>).map((p) => p.id)
    if (ids.length === 0) {
      // No properties under that entity — short-circuit to empty.
      return (
        <div className="space-y-6">
          <PageHeader
            title="Tenancies"
            description="Every let across your portfolio."
            actions={
              <Link href="/tenancies/new" className={buttonVariants()}>
                + New tenancy
              </Link>
            }
          />
          <p className="text-sm text-muted-foreground">No tenancies for that entity.</p>
        </div>
      )
    }
    query = query.in('property_id', ids)
  }

  const { data: rawRows, error } = await query

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tenancies" />
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      </div>
    )
  }

  const tenancies = (rawRows ?? []) as DbRow[]

  const rows: TenancyRow[] = tenancies.map((t) => ({
    id: t.id,
    kind: t.kind,
    status: t.status,
    startDate: t.start_date,
    endDate: t.end_date,
    monthlyRentPence: monthlyRentPence(toBig(t.rent_pence), t.rent_period as RentPeriod),
    propertyAddressLine1: t.property?.[0]?.address_line_1 ?? '—',
    propertyPostcode: t.property?.[0]?.postcode ?? '',
    propertyId: t.property_id,
    unitLabel: t.unit?.[0]?.label ?? null,
    tenantName: t.tenant?.[0]
      ? `${t.tenant[0].first_name} ${t.tenant[0].last_name}`
      : null,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenancies"
        description="Every let across your portfolio."
        actions={
          <>
            <Link
              href="/tenancies/import"
              className={buttonVariants({ variant: 'outline' })}
            >
              Import CSV
            </Link>
            <Link href="/tenancies/new" className={buttonVariants()}>
              + New tenancy
            </Link>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No tenancies yet"
          description="Create one to start tracking rent, dates, and tenants."
          action={
            <Link href="/tenancies/new" className={buttonVariants()}>
              + New tenancy
            </Link>
          }
        />
      ) : (
        <TenanciesTable rows={rows} />
      )}

      <p className="text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'tenancy' : 'tenancies'}
      </p>
    </div>
  )
}
