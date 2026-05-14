# Detail Page Pattern

Header → KPI tiles → tabs → tab content. Used for `/properties/[id]`, `/entities/[id]`, `/mortgages/[id]`, etc.

## File structure

```
app/(app)/properties/[id]/
  page.tsx               # server component, fetches property + computes KPIs
  loading.tsx            # streaming skeleton
  not-found.tsx          # 404 (RLS will route here for cross-org access)
  _components/
    property-header.tsx   # title, badge, actions
    property-kpis.tsx     # 4-up tiles
    property-tabs.tsx     # tab container (client)
    tabs/
      overview-tab.tsx
      units-tab.tsx
      tenancies-tab.tsx
      finance-tab.tsx
      compliance-tab.tsx
      maintenance-tab.tsx
      documents-tab.tsx
```

## Server component

```tsx
// app/(app)/properties/[id]/page.tsx
import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/db/user'
import { PropertyHeader } from './_components/property-header'
import { PropertyKpis } from './_components/property-kpis'
import { PropertyTabs } from './_components/property-tabs'

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sb = await supabaseServer()

  const { data: property, error } = await sb
    .from('properties')
    .select(`
      *,
      entity:entities(id, name, kind),
      mortgages(id, current_balance_pence, interest_rate_bps, fixed_end_date, product),
      valuations(id, valuation_date, value_pence, kind)
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !property) notFound()  // RLS will give the same result for cross-org

  return (
    <div className="space-y-6">
      <PropertyHeader property={property} />
      <PropertyKpis property={property} />
      <PropertyTabs propertyId={id} initialProperty={property} />
    </div>
  )
}
```

## Header

```tsx
// app/(app)/properties/[id]/_components/property-header.tsx
import Link from 'next/link'
import { ChevronLeft, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { meesStatus } from '@/lib/domain/mees'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'

export function PropertyHeader({ property }: { property: any }) {
  const status = meesStatus(property.epc_rating, property.epc_expiry)

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Link href="/properties" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4 mr-1" /> All properties
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{property.address_line_1}</h1>
          {status !== 'compliant' && <StatusBadge status={status} />}
        </div>
        <p className="text-sm text-muted-foreground">
          {[property.postcode, property.kind.replace('_', ' '), property.entity?.name]
            .filter(Boolean)
            .join(' • ')}
        </p>
      </div>

      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href={`/properties/${property.id}/edit`}>Edit</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Add valuation</DropdownMenuItem>
            <DropdownMenuItem>Upload document</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
```

## KPI tiles

```tsx
// components/kpi-tile.tsx
import { cn } from '@/lib/utils'

export function KpiTile({
  label,
  value,
  sub,
  trend,
  className,
}: {
  label: string
  value: string | React.ReactNode
  sub?: string
  trend?: 'up' | 'down' | 'flat'
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 space-y-1', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
```

```tsx
// app/(app)/properties/[id]/_components/property-kpis.tsx
import { KpiTile } from '@/components/kpi-tile'
import { equity, ltvBps } from '@/lib/domain/equity'
import { grossYieldBps } from '@/lib/domain/yield'
import { formatGbp, bpsToPercent } from '@/lib/money'

export function PropertyKpis({ property }: { property: any }) {
  const valuation = BigInt(property.current_valuation_pence ?? property.purchase_price_pence ?? 0)
  const balance = (property.mortgages ?? []).reduce(
    (sum: bigint, m: any) => sum + BigInt(m.current_balance_pence ?? 0),
    0n
  )
  const eq = equity({ valuationPence: valuation, balancePence: balance })
  const ltv = ltvBps({ valuationPence: valuation, balancePence: balance })

  // Annual rent estimate (sum of tenancies' monthly rent * 12)
  const annualRent = 0n // populated when tenancies are loaded
  const yieldBps = grossYieldBps(annualRent, valuation)

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiTile label="Valuation" value={formatGbp(valuation)} sub={property.current_valuation_as_of ? `as of ${property.current_valuation_as_of}` : 'purchase price'} />
      <KpiTile label="Equity" value={formatGbp(eq)} sub={balance > 0n ? `${formatGbp(balance)} debt` : 'unencumbered'} />
      <KpiTile label="LTV" value={bpsToPercent(ltv)} />
      <KpiTile label="Gross yield" value={bpsToPercent(yieldBps)} sub="annual rent / valuation" />
    </div>
  )
}
```

## Tabs (client component)

```tsx
// app/(app)/properties/[id]/_components/property-tabs.tsx
'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { OverviewTab } from './tabs/overview-tab'
import { UnitsTab } from './tabs/units-tab'
import { FinanceTab } from './tabs/finance-tab'
import { ComplianceTab } from './tabs/compliance-tab'
import { MaintenanceTab } from './tabs/maintenance-tab'
import { DocumentsTab } from './tabs/documents-tab'

export function PropertyTabs({ propertyId, initialProperty }: { propertyId: string; initialProperty: any }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('tab') ?? 'overview'

  const setTab = (v: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (v === 'overview') params.delete('tab')
    else params.set('tab', v)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <Tabs value={current} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="units">Units</TabsTrigger>
        <TabsTrigger value="finance">Finance</TabsTrigger>
        <TabsTrigger value="compliance">Compliance</TabsTrigger>
        <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
      </TabsList>

      <TabsContent value="overview"><OverviewTab property={initialProperty} /></TabsContent>
      <TabsContent value="units"><UnitsTab propertyId={propertyId} /></TabsContent>
      <TabsContent value="finance"><FinanceTab propertyId={propertyId} /></TabsContent>
      <TabsContent value="compliance"><ComplianceTab propertyId={propertyId} /></TabsContent>
      <TabsContent value="maintenance"><MaintenanceTab propertyId={propertyId} /></TabsContent>
      <TabsContent value="documents"><DocumentsTab propertyId={propertyId} /></TabsContent>
    </Tabs>
  )
}
```

## Tab content patterns

Each tab is its own server component (where possible) loaded by the route, OR a client component fetching its own data. For tabs that always show with the page, embed at parent. For heavier tabs (documents, audit log), lazy-load via separate route segment.

Heavy tab → switch to nested route:

```
app/(app)/properties/[id]/documents/page.tsx
```

Then the `<TabsTrigger value="documents">` becomes a `<Link href="/properties/[id]/documents">`. This is a Next.js parallel-routes pattern — see `references/navigation.md` for the full setup.

## Editing — Sheet over modal

Single-field or quick edits open a `<Sheet>` from the right edge. Multi-section edits go to the `/edit` route.

```tsx
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet'

<Sheet>
  <SheetTrigger asChild><Button variant="outline" size="sm">Update EPC</Button></SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Update EPC rating</SheetTitle>
    </SheetHeader>
    {/* compact form */}
  </SheetContent>
</Sheet>
```

## not-found.tsx

```tsx
// app/(app)/properties/[id]/not-found.tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center space-y-4">
      <h1 className="text-2xl font-semibold">Property not found</h1>
      <p className="text-muted-foreground">
        It might have been archived, or you may not have access.
      </p>
      <Button asChild><Link href="/properties">Back to properties</Link></Button>
    </div>
  )
}
```

**Important**: this same 404 page renders for cross-org access attempts because RLS returns no rows. Do not surface a "Forbidden" message — the row should be invisible.

## Anti-patterns

1. Tabs that lose state on navigation away and back — use URL state.
2. Edit in centred modal — use Sheet (drawer) or dedicated edit route.
3. Loading the whole property + all tabs' data eagerly — load tabs lazily where they're heavy.
4. Per-page KPI tiles — use the shared `<KpiTile>`.
5. Server-rendering the entire detail page synchronously — use `<Suspense>` boundaries around heavy tab content.
