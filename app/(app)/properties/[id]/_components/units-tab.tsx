// Server-rendered tab body for the Units section on a property detail page.
// Used by PropertyTabs when ?tab=units. Falls back to <EmptyState> + create
// link if no units exist.

import Link from 'next/link'
import { supabaseServer } from '@/lib/db/user'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { UnitsTable, type UnitRow } from '../units/_components/units-table'
import { occupancyBps } from '@/lib/domain/occupancy'
import type { UnitStatus } from '@/lib/domain/occupancy'
import { bpsToPercent } from '@/lib/money'

type UnitDbRow = {
  id: string
  label: string
  bedrooms: number
  floor_area_sqm: number | string | null
  market_rent_pence: string | number | null
  status: string
}

type TenancyDbRow = {
  id: string
  unit_id: string | null
  status: string
  rent_pence: string | number
  rent_period: string
  end_date: string | null
  tenant: Array<{ first_name: string; last_name: string }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export async function UnitsTab({ propertyId }: { propertyId: string }) {
  const sb = await supabaseServer()

  const { data: rawUnits } = await sb
    .from('units')
    .select('id, label, bedrooms, floor_area_sqm, market_rent_pence, status')
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .order('label')

  const units = (rawUnits ?? []) as UnitDbRow[]

  if (units.length === 0) {
    return (
      <EmptyState
        title="No units yet"
        description="Add a room or flat to enable per-unit tenancies, rent roll, and HMO occupancy tracking."
        action={
          <Link
            href={`/properties/${propertyId}/units/new`}
            className={buttonVariants()}
          >
            + New unit
          </Link>
        }
      />
    )
  }

  // Active tenancies per unit (current rent + lead tenant name).
  const { data: rawTenancies } = await sb
    .from('tenancies')
    .select(
      'id, unit_id, status, rent_pence, rent_period, end_date, tenant:tenants(first_name, last_name)',
    )
    .eq('property_id', propertyId)
    .eq('status', 'active')
    .is('deleted_at', null)

  const tenancies = (rawTenancies ?? []) as TenancyDbRow[]
  const byUnit = new Map<string, TenancyDbRow>()
  for (const t of tenancies) {
    if (t.unit_id) byUnit.set(t.unit_id, t)
  }

  const rows: UnitRow[] = units.map((u) => {
    const current = byUnit.get(u.id)
    return {
      id: u.id,
      label: u.label,
      bedrooms: u.bedrooms,
      floorAreaSqm: u.floor_area_sqm === null ? null : Number(u.floor_area_sqm),
      marketRentPence:
        u.market_rent_pence === null
          ? null
          : toBig(u.market_rent_pence),
      status: u.status,
      currentTenantName: current?.tenant?.[0]
        ? `${current.tenant[0].first_name} ${current.tenant[0].last_name}`
        : null,
      currentRentPence: current ? toBig(current.rent_pence) : null,
      propertyId,
    }
  })

  const occ = occupancyBps(units.map((u) => ({ status: u.status as UnitStatus })))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {units.length} {units.length === 1 ? 'unit' : 'units'} · {bpsToPercent(occ)} occupied
        </p>
        <Link
          href={`/properties/${propertyId}/units/new`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          + New unit
        </Link>
      </div>
      <UnitsTable rows={rows} />
    </div>
  )
}
