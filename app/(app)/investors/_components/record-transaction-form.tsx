'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TRANSACTION_KINDS, type InvestorTxKind } from '@/lib/schemas/investor'
import { recordInvestorTransaction } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

const KIND_LABELS: Record<InvestorTxKind, string> = {
  contribution: 'Contribution (+)',
  distribution: 'Distribution (−)',
  interest_accrual: 'Interest accrual (+)',
  fee: 'Fee (−)',
  redemption: 'Redemption (−)',
  adjustment: 'Adjustment (+/−)',
}

type Props = {
  accountId: string
  accountStatus: string
}

export function RecordTransactionForm({ accountId, accountStatus }: Props) {
  const router = useRouter()
  const [kind, setKind] = useState<InvestorTxKind>('contribution')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const negativeKinds = new Set(['distribution', 'fee', 'redemption'])
  const sign = negativeKinds.has(kind) ? -1 : 1

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        const fd = new FormData(e.currentTarget)
        const rawAmount = String(fd.get('amountAbsPence') ?? '')
        const signed =
          rawAmount === ''
            ? rawAmount
            : (sign === -1 ? `-${rawAmount.replace(/^-/, '')}` : rawAmount.replace(/^-/, ''))
        startTransition(async () => {
          const result = await recordInvestorTransaction({
            accountId,
            kind,
            amountPence: signed,
            transactionDate: fd.get('transactionDate'),
            notes: fd.get('notes'),
          })
          if (!result.ok) {
            setError(result.error)
            return
          }
          router.push(`/investors/accounts/${accountId}`)
          router.refresh()
        })
      }}
      className="space-y-8"
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {accountStatus !== 'open' && (
        <Alert variant="destructive">
          <AlertDescription>
            Account is {accountStatus}. Only `adjustment` transactions are accepted.
          </AlertDescription>
        </Alert>
      )}

      <FormSection title="Event">
        <FormField label="Kind" required htmlFor="rt-kind">
          <Select
            id="rt-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as InvestorTxKind)}
            required
          >
            {TRANSACTION_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
        <FormField label="Date" required htmlFor="rt-date">
          <Input id="rt-date" name="transactionDate" type="date" required />
        </FormField>
        <FormField
          label="Amount (£)"
          hint={
            sign === -1
              ? 'Sign auto-applied. Enter the cash figure as positive.'
              : 'Sign auto-applied — contribution-positive convention.'
          }
          required
          htmlFor="rt-amt"
        >
          <Input id="rt-amt" name="amountAbsPence" inputMode="decimal" required />
        </FormField>
        <FormField label="Notes" htmlFor="rt-notes" fullWidth>
          <Textarea id="rt-notes" name="notes" rows={2} />
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Recording…' : 'Record'}
        </Button>
      </div>
    </form>
  )
}
