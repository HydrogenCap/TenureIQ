// Per-property units table — used both on the property detail Units tab
// and on the dedicated /units route (which is just the detail tab in
// expanded layout for the future).
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'

export type UnitRow = {
  id: string
  label: string
  bedrooms: number
  floorAreaSqm: number | null
  marketRentPence: bigint | null
  status: string
  currentTenantName: string | null
  currentRentPence: bigint | null
  propertyId: string
}

export function UnitsTable({ rows }: { rows: UnitRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Unit</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Size m²</TableHead>
          <TableHead>Tenant</TableHead>
          <TableHead className="text-right">Rent</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              <Link
                href={`/properties/${row.propertyId}/units/${row.id}/edit`}
                className="hover:underline"
              >
                {row.label}
              </Link>
              {row.bedrooms > 0 && (
                <p className="text-xs text-muted-foreground">{row.bedrooms} bed</p>
              )}
            </TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.floorAreaSqm === null ? '—' : row.floorAreaSqm.toFixed(1)}
            </TableCell>
            <TableCell className="text-sm">{row.currentTenantName ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">
              <MoneyDisplay pence={row.currentRentPence ?? row.marketRentPence} />
              {row.currentRentPence === null && row.marketRentPence !== null && (
                <p className="text-xs text-muted-foreground">market</p>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
