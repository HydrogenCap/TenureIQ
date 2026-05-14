// app/(app)/properties/_components/property-table.tsx
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'

export type PropertyRow = {
  id: string
  addressLine1: string
  city: string
  postcode: string
  kind: string
  entityName: string
  epcRating: string | null
  currentValuationPence: bigint | null
  purchasePricePence: bigint
}

export function PropertyTable({ rows }: { rows: PropertyRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Address</TableHead>
          <TableHead>Entity</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>EPC</TableHead>
          <TableHead className="text-right">Valuation</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              <Link href={`/properties/${row.id}`} className="hover:underline">
                {row.addressLine1}, {row.postcode}
              </Link>
              <p className="text-xs text-muted-foreground">{row.city}</p>
            </TableCell>
            <TableCell className="text-sm">{row.entityName}</TableCell>
            <TableCell>
              <StatusBadge status={row.kind} />
            </TableCell>
            <TableCell className="font-mono text-xs">{row.epcRating ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">
              <MoneyDisplay pence={row.currentValuationPence ?? row.purchasePricePence} />
              {row.currentValuationPence === null && (
                <p className="text-xs text-muted-foreground">at purchase</p>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
