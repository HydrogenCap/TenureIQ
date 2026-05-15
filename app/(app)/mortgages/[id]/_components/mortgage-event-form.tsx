'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormField } from '@/components/form-field'
import { recordMortgageEvent } from '../../actions'

type Props = {
  mortgageId: string
  isInterestOnly: boolean
}

export function MortgageEventForm({ mortgageId, isInterestOnly }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<string>(
    isInterestOnly ? 'payment_interest_only' : 'payment',
  )

  if (!open) {
    return (
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Record event
        </Button>
      </div>
    )
  }

  const showAmount =
    kind === 'payment' || kind === 'payment_interest_only' || kind === 'redemption'
  const showRate = kind === 'rate_change' || kind === 'product_switch'
  const showBalance = kind === 'reconciliation' || kind === 'drawdown'

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">Record event</h3>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
        >
          ✕
        </button>
      </div>
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(async () => {
            const result = await recordMortgageEvent({
              mortgageId,
              kind,
              eventDate: fd.get('eventDate'),
              amountPence: showAmount ? fd.get('amountPence') : null,
              ratePostBps: showRate ? fd.get('ratePostBps') : null,
              balancePence: showBalance ? fd.get('balancePence') : null,
              notes: fd.get('notes'),
            })
            if (!result.ok) {
              setError(result.error)
              return
            }
            setOpen(false)
            setError(null)
            router.refresh()
          })
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <FormField label="Kind" required htmlFor="me-kind">
          <Select
            id="me-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="payment">Payment</option>
            <option value="payment_interest_only">Interest-only payment</option>
            <option value="rate_change">Rate change</option>
            <option value="product_switch">Product switch</option>
            <option value="redemption">Redemption</option>
            <option value="er_charge">Early-repayment charge</option>
            <option value="reconciliation">Reconciliation</option>
          </Select>
        </FormField>
        <FormField label="Event date" required htmlFor="me-date">
          <Input id="me-date" name="eventDate" type="date" required />
        </FormField>
        {showAmount && (
          <FormField label="Amount (£)" required htmlFor="me-amt">
            <Input id="me-amt" name="amountPence" inputMode="decimal" required />
          </FormField>
        )}
        {showRate && (
          <FormField
            label="New rate"
            hint="Type 5.25 or 525 (basis points)"
            required
            htmlFor="me-rate"
          >
            <Input id="me-rate" name="ratePostBps" inputMode="decimal" required />
          </FormField>
        )}
        {showBalance && (
          <FormField label="Balance (£)" required htmlFor="me-bal">
            <Input id="me-bal" name="balancePence" inputMode="decimal" required />
          </FormField>
        )}
        <FormField label="Notes" htmlFor="me-notes" fullWidth>
          <Textarea id="me-notes" name="notes" rows={2} />
        </FormField>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Recording…' : 'Record event'}
          </Button>
        </div>
      </form>
    </div>
  )
}
