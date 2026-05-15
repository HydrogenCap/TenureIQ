'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  TransactionCreateSchema,
  type TransactionCreate,
} from '@/lib/schemas/transaction'
import { TRANSACTION_CATEGORIES } from '@/lib/domain/transactions'
import { createTransaction, updateTransaction } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

type Opt = { id: string; name: string }

type Props =
  | {
      mode: 'create'
      transactionId?: undefined
      bankAccounts: Opt[]
      properties: Opt[]
      initial?: Partial<TransactionCreate>
    }
  | {
      mode: 'edit'
      transactionId: string
      bankAccounts: Opt[]
      properties: Opt[]
      initial: TransactionCreate
    }

export function TransactionForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<TransactionCreate>({
    resolver: zodResolver(TransactionCreateSchema),
    defaultValues: {
      bankAccountId: null,
      postedAt: new Date(),
      description: '',
      amountPence: 0n,
      categoryCode: 'uncategorised',
      propertyId: null,
      reference: null,
      ...props.initial,
    },
  })

  const errors = form.formState.errors

  const onSubmit = (data: TransactionCreate) => {
    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await createTransaction(data)
          : await updateTransaction(props.transactionId, data)

      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof TransactionCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      if (props.mode === 'create' && result.data) {
        router.push(`/transactions/${result.data.id}`)
      } else {
        router.push(`/transactions/${props.transactionId}`)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      {errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <FormSection title="Movement">
        <FormField label="Date" required error={errors.postedAt?.message} htmlFor="t-date">
          <Input id="t-date" type="date" {...form.register('postedAt')} />
        </FormField>
        <FormField
          label="Amount (£)"
          hint="Positive = credit (in). Negative = debit (out)."
          required
          error={errors.amountPence?.message}
          htmlFor="t-amt"
        >
          <Input id="t-amt" inputMode="decimal" {...form.register('amountPence')} />
        </FormField>
        <FormField
          label="Description"
          required
          error={errors.description?.message}
          htmlFor="t-desc"
          fullWidth
        >
          <Input id="t-desc" {...form.register('description')} />
        </FormField>
        <FormField label="Reference" error={errors.reference?.message} htmlFor="t-ref" fullWidth>
          <Input id="t-ref" {...form.register('reference')} />
        </FormField>
      </FormSection>

      <FormSection title="Classification">
        <FormField label="Bank account" error={errors.bankAccountId?.message} htmlFor="t-ba">
          <Select id="t-ba" {...form.register('bankAccountId')}>
            <option value="">— None —</option>
            {props.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Property" error={errors.propertyId?.message} htmlFor="t-prop">
          <Select id="t-prop" {...form.register('propertyId')}>
            <option value="">— Entity-level —</option>
            {props.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormField>
        <FormField
          label="Category"
          required
          error={errors.categoryCode?.message}
          htmlFor="t-cat"
          fullWidth
        >
          <Select id="t-cat" {...form.register('categoryCode')}>
            {TRANSACTION_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </Select>
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? props.mode === 'create' ? 'Recording…' : 'Saving…'
            : props.mode === 'create' ? 'Record transaction' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
