// app/(app)/properties/_components/property-table.tsx
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { meesStatus, type EpcBand } from '@/lib/domain/mees'

export type PropertyRow = {
  id: string
  addressLine1: string
  city: string
  postcode: string
  kind: string
  entityName: string
  epcRating: string | null
  epcExpiry: string | null
  currentValuationPence: bigint | null
  purchasePricePence: bigint
}

// Render a colour-coded MEES badge alongside the raw EPC letter. Tied
// to the meesStatus helper so the legal interpretation stays
// consistent with the createTenancy block at lib/domain/mees.ts.
function MeesBadge({ band, expiry }: { band: string | null; expiry: string | null }) {
  const status = meesStatus(band === null ? null : (band as EpcBand), expiry)
  switch (status) {
    case 'let_blocked':
      return (
        <span
          className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700 dark:bg-red-900/30 dark:text-red-300"
          title="EPC F or G — cannot legally be let without an exemption"
        >
          Let blocked
        </span>
      )
    case 'epc_expired':
      return (
        <span
          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          title="EPC has expired — renew before re-letting"
        >
          EPC expired
        </span>
      )
    case 'epc_missing':
      return (
        <span
          className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          title="No EPC rating recorded"
        >
          EPC missing
        </span>
      )
    case 'compliant':
      return (
        <span
          className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          title="MEES compliant"
        >
          MEES ok
        </span>
      )
  }
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
          <TableHead>MEES</TableHead>
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
            <TableCell>
              <MeesBadge band={row.epcRating} expiry={row.epcExpiry} />
            </TableCell>
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
