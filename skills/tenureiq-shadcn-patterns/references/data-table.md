# DataTable Component (TanStack Table v8)

The reusable `<DataTable>` lives in `components/data-table.tsx`. Every resource page composes it with typed columns. Do not build per-resource tables from scratch.

## The base component

```tsx
// components/data-table.tsx
'use client'

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DataTableProps<T> = {
  data: T[]
  columns: ColumnDef<T>[]
  totalCount: number
  currentPage: number
  pageSize: number
  emptyState?: React.ReactNode
  rowHref?: (row: T) => string  // optional row-click navigation
}

export function DataTable<T>({
  data,
  columns,
  totalCount,
  currentPage,
  pageSize,
  emptyState,
  rowHref,
}: DataTableProps<T>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const setPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (page === 1) params.delete('page')
    else params.set('page', String(page))
    startTransition(() => router.replace(`${pathname}?${params.toString()}`))
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const isEmpty = data.length === 0

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isEmpty ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  {emptyState ?? <p className="text-sm text-muted-foreground">No results.</p>}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(rowHref && 'cursor-pointer hover:bg-muted/50')}
                  onClick={rowHref ? () => router.push(rowHref(row.original)) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!isEmpty && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 py-1">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

## Column definition pattern

Columns are typed against the row shape. Put them in a separate file so the table component stays generic.

```tsx
// app/(app)/properties/_components/property-columns.tsx
'use client'

import { ColumnDef } from '@tanstack/react-table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { meesStatus } from '@/lib/domain/mees'

export type PropertyRow = {
  id: string
  address_line_1: string
  postcode: string
  kind: string
  epc_rating: string | null
  epc_expiry: string | null
  current_valuation_pence: string | null  // bigint as string from JSON
  entity: { id: string; name: string } | null
}

export const propertyColumns: ColumnDef<PropertyRow>[] = [
  {
    accessorKey: 'address_line_1',
    header: 'Address',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.address_line_1}</p>
        <p className="text-xs text-muted-foreground">{row.original.postcode}</p>
      </div>
    ),
  },
  {
    accessorKey: 'entity',
    header: 'Entity',
    cell: ({ row }) => row.original.entity?.name ?? '—',
  },
  {
    accessorKey: 'kind',
    header: 'Kind',
    cell: ({ row }) => (
      <span className="capitalize">{row.original.kind.replace('_', ' ')}</span>
    ),
  },
  {
    accessorKey: 'epc_rating',
    header: 'EPC',
    cell: ({ row }) => {
      const band = row.original.epc_rating
      const status = meesStatus(band as any, row.original.epc_expiry)
      return (
        <div className="flex items-center gap-2">
          <span className="font-mono">{band ?? '—'}</span>
          {status === 'let_blocked' && <StatusBadge status="let_blocked" />}
          {status === 'epc_expired' && <StatusBadge status="epc_expired" />}
        </div>
      )
    },
  },
  {
    accessorKey: 'current_valuation_pence',
    header: () => <div className="text-right">Value</div>,
    cell: ({ row }) => (
      <div className="text-right">
        <MoneyDisplay pence={row.original.current_valuation_pence} />
      </div>
    ),
    enableSorting: true,
  },
]
```

## Usage

```tsx
// app/(app)/properties/_components/property-table.tsx
'use client'

import { DataTable } from '@/components/data-table'
import { propertyColumns, type PropertyRow } from './property-columns'
import { EmptyState } from '@/components/empty-state'
import { Building2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function PropertyTable({ data, totalCount, currentPage, pageSize }: {
  data: PropertyRow[]
  totalCount: number
  currentPage: number
  pageSize: number
}) {
  return (
    <DataTable
      data={data}
      columns={propertyColumns}
      totalCount={totalCount}
      currentPage={currentPage}
      pageSize={pageSize}
      rowHref={(row) => `/properties/${row.id}`}
      emptyState={
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add your first property to start tracking your portfolio."
          action={<Button asChild><Link href="/properties/new">+ Add property</Link></Button>}
        />
      }
    />
  )
}
```

## Sort via URL state (advanced)

For sorting that survives navigation, sort state goes to the URL via `?sort=field` or `?sort=-field` for descending. The server component reads the param and passes the order clause to Supabase. The client `useState<SortingState>` is then just visual feedback; on toggle, the client updates the URL and re-fetches.

Implement that when you need it; basic sorting (in-memory on the current page) is fine for most pages.

## When the dataset is big

- 10k+ rows: switch from client-side sort to URL-state server sort.
- 100k+: introduce server-side cursor pagination (use `(created_at, id)` tuple).
- 1M+: out of scope for TenureIQ v1 — no single org will have this.

## Anti-patterns

1. Inline column defs in JSX (untyped, unreadable).
2. Reaching for AG Grid or MUI DataGrid — overkill, doesn't match shadcn aesthetic.
3. Storing sort/filter in component state — breaks bookmarking and refresh.
4. Using `rowHref` and a per-row Edit/Delete dropdown — pick one nav model per page.
