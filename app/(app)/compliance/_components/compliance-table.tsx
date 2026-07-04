'use client'

// Compliance list table with owner/admin bulk selection. Selection state
// lives client-side; the only mutation is bulkMarkExempt, which mirrors
// the single-item markExempt semantics (reason recorded in notes).

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { bulkMarkExempt } from '../actions'

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

export function ComplianceTable({
  rows,
  canBulkEdit = false,
}: {
  rows: ComplianceRow[]
  canBulkEdit?: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  // Already-exempt rows cannot be re-exempted — exclude them from
  // select-all so the count reflects what the action will touch.
  const selectableIds = useMemo(
    () => rows.filter((r) => r.status !== 'exempt').map((r) => r.id),
    [rows],
  )
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }

  const submitBulkExempt = () => {
    setFeedback(null)
    startTransition(async () => {
      const result = await bulkMarkExempt({ itemIds: [...selected], reason })
      if (!result.ok) {
        setFeedback({ kind: 'error', text: result.error })
        return
      }
      setFeedback({
        kind: 'ok',
        text: `Marked ${result.data.updated} item${result.data.updated === 1 ? '' : 's'} exempt.`,
      })
      setSelected(new Set())
      setReason('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {canBulkEdit && selected.size > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
          <p className="text-sm font-medium">
            {selected.size} selected
          </p>
          <div className="min-w-56 flex-1">
            <Input
              placeholder="Exemption reason (recorded on each item)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label="Exemption reason"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || reason.trim().length < 3}
            onClick={submitBulkExempt}
          >
            {pending ? 'Marking…' : 'Mark exempt'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {feedback && (
        <Alert variant={feedback.kind === 'error' ? 'destructive' : undefined}>
          <AlertDescription>{feedback.text}</AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {canBulkEdit && (
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all non-exempt items"
                />
              </TableHead>
            )}
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
              {canBulkEdit && (
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    disabled={row.status === 'exempt'}
                    onChange={() => toggle(row.id)}
                    aria-label={`Select ${row.propertyAddressLine1} ${row.kind}`}
                  />
                </TableCell>
              )}
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
    </div>
  )
}
