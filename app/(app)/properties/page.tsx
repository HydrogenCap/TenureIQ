// app/(app)/properties/page.tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { PropertyTable, type PropertyRow } from './_components/property-table'
import { PropertyFilters } from './_components/property-filters'

export const metadata = { title: 'Properties' }

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string; kind?: string }>
}) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const { q, entity, kind } = await searchParams

  const sb = await supabaseServer()
  let query = sb
    .from('properties')
    .select(
      'id, address_line_1, city, postcode, kind, entity_id, epc_rating, epc_expiry, current_valuation_pence, purchase_price_pence',
    )
    .is('deleted_at', null)
    .order('address_line_1')

  if (entity) query = query.eq('entity_id', entity)
  if (kind) query = query.eq('kind', kind)
  if (q) {
    const safe = q.trim().replace(/[%_]/g, '')
    if (safe) query = query.or(`address_line_1.ilike.%${safe}%,postcode.ilike.%${safe}%`)
  }

  const { data: rawProperties, error } = await query

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Properties" />
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      </div>
    )
  }

  const properties = (rawProperties ?? []) as Array<{
    id: string
    address_line_1: string
    city: string
    postcode: string
    kind: string
    entity_id: string
    epc_rating: string | null
    epc_expiry: string | null
    current_valuation_pence: string | number | null
    purchase_price_pence: string | number
  }>

  const { data: rawEntities } = await sb
    .from('entities')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  const entityList = (rawEntities ?? []) as Array<{ id: string; name: string }>
  const entityById = new Map(entityList.map((e) => [e.id, e.name]))

  const rows: PropertyRow[] = properties.map((p) => ({
    id: p.id,
    addressLine1: p.address_line_1,
    city: p.city,
    postcode: p.postcode,
    kind: p.kind,
    entityName: entityById.get(p.entity_id) ?? '—',
    epcRating: p.epc_rating,
    epcExpiry: p.epc_expiry,
    purchasePricePence: BigInt(
      typeof p.purchase_price_pence === 'string'
        ? p.purchase_price_pence
        : Math.round(p.purchase_price_pence),
    ),
    currentValuationPence:
      p.current_valuation_pence === null
        ? null
        : BigInt(
            typeof p.current_valuation_pence === 'string'
              ? p.current_valuation_pence
              : Math.round(p.current_valuation_pence),
          ),
  }))

  const hasAnyProperty = properties.length > 0 || !!(q || entity || kind)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        description="Every property in your portfolio, across all entities."
        actions={
          <>
            <Link href="/properties/import" className={buttonVariants({ variant: 'outline' })}>
              Import CSV
            </Link>
            <Link href="/properties/new" className={buttonVariants()}>
              + New property
            </Link>
          </>
        }
      />

      <PropertyFilters entities={entityList} />

      {!hasAnyProperty ? (
        <EmptyState
          title="No properties yet"
          description="Add your first property or import from CSV."
          action={
            <div className="flex gap-2">
              <Link href="/properties/import" className={buttonVariants({ variant: 'outline' })}>
                Import CSV
              </Link>
              <Link href="/properties/new" className={buttonVariants()}>
                + New property
              </Link>
            </div>
          }
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No properties match these filters.</p>
      ) : (
        <PropertyTable rows={rows} />
      )}

      <p className="text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'property' : 'properties'}
      </p>
    </div>
  )
}
