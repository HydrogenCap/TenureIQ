# List Page Pattern

The canonical list page in TenureIQ. Used for `/properties`, `/entities`, `/tenancies`, `/mortgages`, `/transactions`, `/compliance`, `/maintenance`, `/documents`. All share the same skeleton; what changes is columns and filters.

## File structure

```
app/(app)/<resource>/
  page.tsx                          # server component, fetches data
  loading.tsx                       # streaming skeleton
  _components/
    <resource>-table.tsx            # client component — TanStack Table
    <resource>-filters.tsx          # client component — URL-state filters
    <resource>-columns.tsx          # column definitions (typed)
```

## Server component (page.tsx)

```tsx
// app/(app)/properties/page.tsx
import { Suspense } from 'react'
import { supabaseServer } from '@/lib/db/user'
import { PropertyTable } from './_components/property-table'
import { PropertyFilters } from './_components/property-filters'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

type SearchParams = {
  q?: string
  entity?: string
  kind?: string
  epc?: string
  status?: string
  sort?: string
  page?: string
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const sb = await supabaseServer()

  let query = sb
    .from('properties')
    .select(
      'id, address_line_1, postcode, kind, epc_rating, current_valuation_pence, entity:entities(id, name)',
      { count: 'exact' }
    )
    .is('deleted_at', null)

  if (params.q) query = query.ilike('address_line_1', `%${params.q}%`)
  if (params.entity) query = query.eq('entity_id', params.entity)
  if (params.kind) query = query.eq('kind', params.kind)
  if (params.epc) query = query.eq('epc_rating', params.epc)

  const page = Number(params.page ?? '1')
  const pageSize = 25
  query = query.range((page - 1) * pageSize, page * pageSize - 1)

  // Default sort: newest first
  query = query.order(params.sort?.replace(/^-/, '') ?? 'created_at', {
    ascending: params.sort?.startsWith('-') === false,
  })

  const { data: properties, count } = await query

  // Filter dropdown options come from a parallel query
  const { data: entities } = await sb
    .from('entities')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        description="Your portfolio of properties across all entities."
        actions={
          <Button asChild>
            <Link href="/properties/new">+ New property</Link>
          </Button>
        }
      />

      <PropertyFilters entities={entities ?? []} />

      <PropertyTable
        data={properties ?? []}
        totalCount={count ?? 0}
        currentPage={page}
        pageSize={pageSize}
      />
    </div>
  )
}
```

## Filters (client component, URL-state)

```tsx
// app/(app)/properties/_components/property-filters.tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { useTransition, useCallback } from 'react'

export function PropertyFilters({ entities }: { entities: { id: string; name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === null || value === '' || value === 'all') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      params.delete('page') // reset pagination when filters change
      startTransition(() => router.replace(`${pathname}?${params.toString()}`))
    },
    [pathname, router, searchParams]
  )

  const hasActiveFilters = ['q', 'entity', 'kind', 'epc'].some((k) => searchParams.has(k))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        placeholder="Search address..."
        defaultValue={searchParams.get('q') ?? ''}
        onChange={(e) => setParam('q', e.target.value)}
        className="max-w-xs"
      />

      <Select
        value={searchParams.get('entity') ?? 'all'}
        onValueChange={(v) => setParam('entity', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All entities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All entities</SelectItem>
          {entities.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('kind') ?? 'all'}
        onValueChange={(v) => setParam('kind', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-40"><SelectValue placeholder="All kinds" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All kinds</SelectItem>
          <SelectItem value="hmo">HMO</SelectItem>
          <SelectItem value="single_let">Single let</SelectItem>
          <SelectItem value="block">Block</SelectItem>
          <SelectItem value="commercial">Commercial</SelectItem>
          <SelectItem value="development">Development</SelectItem>
          <SelectItem value="land">Land</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('epc') ?? 'all'}
        onValueChange={(v) => setParam('epc', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-32"><SelectValue placeholder="All EPC" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All EPC</SelectItem>
          {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((b) => (
            <SelectItem key={b} value={b}>{b}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startTransition(() => router.replace(pathname))}
        >
          <X className="h-4 w-4 mr-1" /> Clear
        </Button>
      )}
    </div>
  )
}
```

## Why URL-state matters

1. Bookmarkable views ("F-rated EPCs in IPLIK Ltd" is shareable as a URL)
2. Back button works correctly
3. Server component re-fetches automatically on param change — no need for client cache invalidation
4. Refreshing the page preserves the view

`useTransition` keeps the input responsive during the server re-fetch.

## Loading state (loading.tsx)

```tsx
// app/(app)/properties/loading.tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="rounded-md border">
        <div className="border-b p-4"><Skeleton className="h-5 w-full" /></div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b p-4 last:border-0">
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

The skeleton matches the rendered layout. Don't ship a generic spinner — every loading state should look like the page that's coming.
