// app/(app)/transactions/import/[id]/_components/preview-table.tsx
// Client preview of staged rows. Lets the user recategorise, assign a
// property, skip / unskip, and finally commit (or reject) the import.
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { StatusBadge } from '@/components/status-badge'
import { TRANSACTION_CATEGORIES } from '@/lib/domain/transactions'
import {
  commitImport,
  rejectImport,
  updateStagedRow,
} from '../../actions'

export type StagedRowVm = {
  id: string
  postedAt: string
  description: string
  amountPence: bigint
  reference: string | null
  externalId: string | null
  categoryCode: string
  propertyId: string | null
  status: string
  duplicateOfTransactionId: string | null
}

type PropertyOpt = { id: string; label: string }

const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent received',
  deposit_received: 'Deposit received',
  aasc_payment: 'AASC payment',
  insurance_payout: 'Insurance payout',
  investor_contribution: 'Investor contribution',
  director_loan_in: 'Director loan (in)',
  refinance_drawdown: 'Refinance drawdown',
  other_income: 'Other income',
  mortgage_payment: 'Mortgage payment',
  mortgage_interest: 'Mortgage — interest only',
  mortgage_capital: 'Mortgage — capital only',
  maintenance: 'Maintenance',
  repairs: 'Repairs',
  insurance_premium: 'Insurance premium',
  agent_fees: 'Letting / managing agent',
  utilities: 'Utilities',
  council_tax: 'Council tax',
  ground_rent: 'Ground rent',
  service_charge: 'Service charge',
  compliance: 'Compliance',
  cleaning: 'Cleaning',
  professional_fees: 'Professional fees',
  travel: 'Travel',
  subscriptions: 'Subscriptions',
  tax_payment: 'Tax payment',
  investor_distribution: 'Investor distribution',
  director_loan_out: 'Director loan (out)',
  capital_expenditure: 'Capital expenditure',
  other_expense: 'Other expense',
  transfer: 'Transfer',
  reconciliation: 'Reconciliation',
  opening_balance: 'Opening balance',
  uncategorised: '— uncategorised —',
}

export function PreviewTable({
  importId,
  status,
  rows: initialRows,
  properties,
}: {
  importId: string
  status: string
  rows: StagedRowVm[]
  properties: PropertyOpt[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<StagedRowVm[]>(initialRows)
  const [error, setError] = useState<string | null>(null)
  const [committedSummary, setCommittedSummary] = useState<{ inserted: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  const counts = useMemo(() => {
    let pending = 0
    let duplicate = 0
    let skipped = 0
    let uncategorised = 0
    for (const r of rows) {
      if (r.status === 'pending') pending++
      else if (r.status === 'duplicate') duplicate++
      else if (r.status === 'skipped') skipped++
      if (r.status !== 'skipped' && r.categoryCode === 'uncategorised') uncategorised++
    }
    return { pending, duplicate, skipped, uncategorised }
  }, [rows])

  const isImmutable = status !== 'previewing'
  const canCommit =
    !isImmutable && counts.pending > 0 && counts.uncategorised === 0

  const persistRow = (next: StagedRowVm) => {
    startTransition(async () => {
      const r = await updateStagedRow({
        rowId: next.id,
        categoryCode: next.categoryCode,
        propertyId: next.propertyId,
        skip: next.status === 'skipped',
      })
      if (!r.ok) {
        setError(r.error)
      }
    })
  }

  const onCategoryChange = (rowId: string, code: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r
        const updated = { ...r, categoryCode: code }
        persistRow(updated)
        return updated
      }),
    )
  }

  const onPropertyChange = (rowId: string, propertyId: string) => {
    const normalised = propertyId === '' ? null : propertyId
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r
        const updated = { ...r, propertyId: normalised }
        persistRow(updated)
        return updated
      }),
    )
  }

  const onSkipToggle = (rowId: string, skip: boolean) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r
        // Skipping a duplicate keeps the underlying flag for context;
        // we only toggle the effective status the commit RPC reads.
        const nextStatus = skip
          ? 'skipped'
          : r.duplicateOfTransactionId
            ? 'duplicate'
            : 'pending'
        const updated = { ...r, status: nextStatus }
        persistRow(updated)
        return updated
      }),
    )
  }

  const onCommit = () => {
    setError(null)
    startTransition(async () => {
      const r = await commitImport({ importId })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setCommittedSummary({ inserted: r.data.inserted })
      router.refresh()
    })
  }

  const onReject = () => {
    if (!confirm('Discard this import? Staged rows will be removed.')) return
    setError(null)
    startTransition(async () => {
      const r = await rejectImport({ importId })
      if (!r.ok) {
        setError(r.error)
        return
      }
      router.push('/transactions/import')
    })
  }

  if (committedSummary) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Committed</AlertTitle>
        <AlertDescription>
          {committedSummary.inserted} transactions inserted. Skipped + duplicate rows were
          not committed.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Import error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {counts.uncategorised > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {counts.uncategorised} row{counts.uncategorised === 1 ? '' : 's'} still need a
            category before you can commit.
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Skip</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const skipped = r.status === 'skipped'
              const isDup = r.duplicateOfTransactionId !== null
              const rowClass = skipped
                ? 'opacity-50'
                : isDup
                  ? 'bg-amber-50/40 dark:bg-amber-900/10'
                  : ''
              return (
                <TableRow key={r.id} className={rowClass}>
                  <TableCell>
                    <Checkbox
                      checked={skipped}
                      disabled={isImmutable || isPending}
                      onChange={(e) => onSkipToggle(r.id, e.currentTarget.checked)}
                      aria-label="Skip this row"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    <DateDisplay date={r.postedAt} />
                  </TableCell>
                  <TableCell className="max-w-[28rem]">
                    <div className="truncate font-medium">{r.description}</div>
                    {r.reference && (
                      <div className="truncate text-xs text-muted-foreground">
                        ref: {r.reference}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay
                      pence={r.amountPence}
                      className={
                        r.amountPence < 0n ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={r.categoryCode}
                      disabled={isImmutable || isPending || skipped}
                      onChange={(e) => onCategoryChange(r.id, e.currentTarget.value)}
                      className="min-w-[12rem] text-sm"
                    >
                      {TRANSACTION_CATEGORIES.map((code) => (
                        <option key={code} value={code}>
                          {CATEGORY_LABELS[code] ?? code}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={r.propertyId ?? ''}
                      disabled={isImmutable || isPending || skipped}
                      onChange={(e) => onPropertyChange(r.id, e.currentTarget.value)}
                      className="min-w-[14rem] text-sm"
                    >
                      <option value="">— none —</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              )
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  No rows staged.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {!isImmutable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onCommit} disabled={!canCommit || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Commit {counts.pending} row{counts.pending === 1 ? '' : 's'}
          </Button>
          <Button variant="outline" onClick={onReject} disabled={isPending}>
            Discard import
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {counts.pending} pending · {counts.duplicate} duplicates · {counts.skipped} skipped
            {counts.uncategorised > 0 && ` · ${counts.uncategorised} need category`}
          </span>
        </div>
      )}
    </div>
  )
}
