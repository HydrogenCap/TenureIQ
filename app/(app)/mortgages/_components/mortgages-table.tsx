import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { bpsToPercent } from '@/lib/money'

export type MortgageRow = {
  id: string
  lender: string
  product: string
  propertyAddressLine1: string
  propertyPostcode: string
  currentBalancePence: bigint
  interestRateBps: number
  fixedEndDate: string | null
  ltvBps: number | null
  isInterestOnly: boolean
}

export function MortgagesTable({ rows }: { rows: MortgageRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Property</TableHead>
          <TableHead>Lender / product</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead>Rate</TableHead>
          <TableHead>Fixed end</TableHead>
          <TableHead className="text-right">LTV</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              <Link href={`/mortgages/${row.id}`} className="hover:underline">
                {row.propertyAddressLine1}
              </Link>
              <p className="text-xs text-muted-foreground">{row.propertyPostcode}</p>
            </TableCell>
            <TableCell>
              <p>{row.lender}</p>
              <p className="text-xs text-muted-foreground">
                <StatusBadge status={row.product} className="text-[10px]" />
                {row.isInterestOnly && <span className="ml-1">· IO</span>}
              </p>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <MoneyDisplay pence={row.currentBalancePence} />
            </TableCell>
            <TableCell className="tabular-nums">{bpsToPercent(row.interestRateBps)}</TableCell>
            <TableCell className="text-sm">
              {row.fixedEndDate ? <DateDisplay date={row.fixedEndDate} /> : '—'}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.ltvBps === null ? '—' : bpsToPercent(row.ltvBps)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
