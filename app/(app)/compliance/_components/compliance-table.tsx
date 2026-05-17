import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'

export type ComplianceRow = {
  id: string
  kind: string
  status: string
  issueDate: string | null
  expiryDate: string | null
  issuer: string | null
  propertyId: string
  propertyAddressLine1: string
  propertyPostcode: string
}

export function ComplianceTable({ rows }: { rows: ComplianceRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Property</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Issued</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Issuer</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              <Link href={`/compliance/${row.id}`} className="hover:underline">
                {row.propertyAddressLine1}
              </Link>
              <p className="text-xs text-muted-foreground">{row.propertyPostcode}</p>
            </TableCell>
            <TableCell>
              <StatusBadge status={row.kind} />
            </TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-sm">
              {row.issueDate ? <DateDisplay date={row.issueDate} /> : '—'}
            </TableCell>
            <TableCell className="text-sm">
              {row.expiryDate ? (
                <>
                  <DateDisplay date={row.expiryDate} />
                  <p className="text-xs text-muted-foreground">
                    <DateDisplay date={row.expiryDate} distance />
                  </p>
                </>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell className="text-sm">{row.issuer ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
