// app/(app)/tenancies/_components/tenancies-table.tsx
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'

export type TenancyRow = {
  id: string
  kind: string
  status: string
  startDate: string
  endDate: string | null
  monthlyRentPence: bigint
  propertyAddressLine1: string
  propertyPostcode: string
  propertyId: string
  unitLabel: string | null
  tenantName: string | null
}

export function TenanciesTable({ rows }: { rows: TenancyRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Property / unit</TableHead>
          <TableHead>Tenant</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Start</TableHead>
          <TableHead className="text-right">Rent / month</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              <Link href={`/tenancies/${row.id}`} className="hover:underline">
                {row.propertyAddressLine1}
              </Link>
              <p className="text-xs text-muted-foreground">
                {row.propertyPostcode}
                {row.unitLabel ? ` · ${row.unitLabel}` : ''}
              </p>
            </TableCell>
            <TableCell className="text-sm">
              {row.tenantName ?? (row.kind === 'aasc_placement' ? 'AASC placement' : '—')}
            </TableCell>
            <TableCell>
              <StatusBadge status={row.kind} />
            </TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-sm">
              <DateDisplay date={row.startDate} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <MoneyDisplay pence={row.monthlyRentPence} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
