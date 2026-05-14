// app/(app)/entities/_components/entity-table.tsx
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'

export type EntityRow = {
  id: string
  name: string
  kind: string
  companiesHouseNumber: string | null
  propertyCount: number
  portfolioValuePence: bigint | null
}

export function EntityTable({ rows }: { rows: EntityRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>CH number</TableHead>
          <TableHead className="text-right">Properties</TableHead>
          <TableHead className="text-right">Portfolio value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              <Link href={`/entities/${row.id}`} className="hover:underline">
                {row.name}
              </Link>
            </TableCell>
            <TableCell>
              <StatusBadge status={row.kind} />
            </TableCell>
            <TableCell className="font-mono text-xs">{row.companiesHouseNumber ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{row.propertyCount}</TableCell>
            <TableCell className="text-right tabular-nums">
              <MoneyDisplay pence={row.portfolioValuePence} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
