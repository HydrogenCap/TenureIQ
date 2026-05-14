// app/(app)/entities/page.tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { EntityTable, type EntityRow } from './_components/entity-table'

export default async function EntitiesPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data: rawEntities, error } = await sb
    .from('entities')
    .select('id, name, kind, companies_house_number')
    .is('deleted_at', null)
    .order('name')

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Entities" />
        <p className="text-sm text-destructive">Failed to load entities: {error.message}</p>
      </div>
    )
  }

  const entities = (rawEntities ?? []) as Array<{
    id: string
    name: string
    kind: string
    companies_house_number: string | null
  }>

  // Compute per-entity property count and portfolio value in a single grouped read.
  const { data: rawProperties } = await sb
    .from('properties')
    .select('entity_id, purchase_price_pence, current_valuation_pence')
    .is('deleted_at', null)

  const properties = (rawProperties ?? []) as Array<{
    entity_id: string
    purchase_price_pence: string | number | null
    current_valuation_pence: string | number | null
  }>

  const aggregates = new Map<string, { count: number; valuePence: bigint }>()
  for (const p of properties) {
    const current = aggregates.get(p.entity_id) ?? { count: 0, valuePence: 0n }
    current.count += 1
    const v = p.current_valuation_pence ?? p.purchase_price_pence ?? 0
    current.valuePence += BigInt(typeof v === 'string' ? v : Math.round(v))
    aggregates.set(p.entity_id, current)
  }

  const rows: EntityRow[] = entities.map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    companiesHouseNumber: e.companies_house_number,
    propertyCount: aggregates.get(e.id)?.count ?? 0,
    portfolioValuePence: aggregates.get(e.id)?.valuePence ?? null,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Entities"
        description="Companies, partnerships, and individuals that hold your properties."
        actions={
          <Link href="/entities/new" className={buttonVariants()}>
            + New entity
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No entities yet"
          description="Add your first entity to start holding properties."
          action={
            <Link href="/entities/new" className={buttonVariants()}>
              + New entity
            </Link>
          }
        />
      ) : (
        <EntityTable rows={rows} />
      )}
    </div>
  )
}
