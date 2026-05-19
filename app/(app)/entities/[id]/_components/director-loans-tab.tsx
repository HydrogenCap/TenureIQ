'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, AlertTriangle, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { StatusBadge } from '@/components/status-badge'
import {
  createDirectorLoanEntry,
  archiveDirectorLoanEntry,
} from '../../actions'
import {
  DIRECTOR_LOAN_KINDS,
  type DirectorLoanKindZ,
} from '@/lib/schemas/director-loan'
import { directorLoanBalancesByDirector } from '@/lib/domain/director-loan'

export type DirectorLoanRowVm = {
  id: string
  directorName: string
  kind: string
  eventDate: string
  amountPence: bigint
  description: string | null
}

const KIND_LABELS: Record<string, string> = {
  loan_in: 'Loan in',
  loan_out: 'Loan out',
  interest_accrued: 'Interest accrued',
  repayment: 'Repayment',
}

function kindLabel(code: string): string {
  return KIND_LABELS[code] ?? code
}

// Default sign hint for the amount field. The server-side guard is
// authoritative; this is just so the user doesn't type 100 then have
// the form bounce because they meant -100 for a 'loan_out'.
function defaultSignedHint(kind: DirectorLoanKindZ): '+' | '-' {
  return kind === 'loan_in' || kind === 'interest_accrued' ? '+' : '-'
}

export function DirectorLoansTab({
  entityId,
  initial,
  canManage,
  canArchive,
}: {
  entityId: string
  initial: DirectorLoanRowVm[]
  canManage: boolean
  canArchive: boolean
}) {
  const router = useRouter()
  const [rows, setRows] = useState<DirectorLoanRowVm[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)
  const [formKind, setFormKind] = useState<DirectorLoanKindZ>('loan_in')

  const balances = useMemo(
    () => directorLoanBalancesByDirector(rows),
    [rows],
  )
  const overdrawnDirectors = balances.filter((b) => b.isOverdrawn)

  const onSubmit = (data: FormData) => {
    setError(null)
    const sign = defaultSignedHint(data.get('kind') as DirectorLoanKindZ)
    const rawAmount = (data.get('amountPence') as string | null) ?? ''
    const cleaned = rawAmount.replace(/[£,\s]/g, '')
    // If the user didn't supply a sign, apply the convention for the
    // selected kind. The server enforces it anyway.
    const signed = /^-?\d/.test(cleaned)
      ? cleaned
      : `${sign}${cleaned}`

    startTransition(async () => {
      const r = await createDirectorLoanEntry({
        entityId,
        directorName: data.get('directorName'),
        kind: data.get('kind'),
        eventDate: data.get('eventDate'),
        amountPence: signed,
        description: data.get('description') || null,
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setFormOpen(false)
      router.refresh()
    })
  }

  const onArchive = (id: string) => {
    if (!confirm('Archive this director-loan entry?')) return
    setError(null)
    startTransition(async () => {
      const r = await archiveDirectorLoanEntry(id, entityId)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setRows((prev) => prev.filter((row) => row.id !== id))
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {overdrawnDirectors.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Overdrawn director loan(s)</AlertTitle>
          <AlertDescription>
            {overdrawnDirectors
              .map(
                (b) =>
                  `${b.directorName} owes the company £${(
                    -Number(b.balancePence) / 100
                  ).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`,
              )
              .join(' · ')}
            .{' '}
            <span className="text-xs">
              Overdrawn balances at year-end attract s455 CTA 2010 tax at 33.75%
              until repaid.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {balances.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {balances.map((b) => (
            <div
              key={b.directorName}
              className={`rounded-lg border p-3 ${
                b.isOverdrawn
                  ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950'
                  : 'bg-card'
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {b.directorName}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                <MoneyDisplay pence={b.balancePence} />
              </p>
              <p
                className={`text-xs ${
                  b.isOverdrawn
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-muted-foreground'
                }`}
              >
                {b.isOverdrawn
                  ? 'Overdrawn — director owes the company'
                  : 'Credit balance — company owes the director'}
              </p>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 && !formOpen ? (
        <EmptyState
          title="No director loan entries yet"
          description="Record the first movement to start the ledger."
          action={
            canManage ? (
              <Button onClick={() => setFormOpen(true)}>+ Record entry</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}
            </p>
            {canManage && !formOpen && (
              <Button onClick={() => setFormOpen(true)} variant="outline" size="sm">
                + Record entry
              </Button>
            )}
          </div>

          {rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Director</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Description</TableHead>
                  {canArchive && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      <DateDisplay date={r.eventDate} />
                    </TableCell>
                    <TableCell className="text-sm">{r.directorName}</TableCell>
                    <TableCell>
                      <StatusBadge status={kindLabel(r.kind)} />
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        r.amountPence < 0n ? 'text-red-600 dark:text-red-400' : ''
                      }`}
                    >
                      <MoneyDisplay pence={r.amountPence} precise />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.description ?? '—'}
                    </TableCell>
                    {canArchive && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => onArchive(r.id)}
                          aria-label="Archive entry"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {formOpen && canManage && (
        <form
          action={onSubmit}
          className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2"
        >
          <div>
            <Label htmlFor="directorName">Director name *</Label>
            <Input
              id="directorName"
              name="directorName"
              required
              disabled={isPending}
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="kind">Kind *</Label>
            <Select
              id="kind"
              name="kind"
              defaultValue="loan_in"
              disabled={isPending}
              onChange={(e) => setFormKind(e.target.value as DirectorLoanKindZ)}
            >
              {DIRECTOR_LOAN_KINDS.map((code) => <option key={code} value={code}>{kindLabel(code)}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="eventDate">Date *</Label>
            <Input
              id="eventDate"
              name="eventDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              disabled={isPending}
            />
          </div>
          <div>
            <Label htmlFor="amountPence">
              Amount * (£ — sign auto-applied: {defaultSignedHint(formKind)})
            </Label>
            <Input
              id="amountPence"
              name="amountPence"
              required
              placeholder="1,000.00"
              disabled={isPending}
              inputMode="decimal"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              maxLength={1000}
              placeholder="Optional context — e.g. 'Q1 dividend taken as loan'"
              disabled={isPending}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Record entry'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
