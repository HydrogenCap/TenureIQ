// app/(app)/bank-accounts/_components/bank-account-form.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  BankAccountCreateSchema,
  BANK_ACCOUNT_KINDS,
  type BankAccountCreate,
  type BankAccountKind,
} from '@/lib/schemas/bank-account'
import { createBankAccount, updateBankAccount } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

const KIND_LABELS: Record<BankAccountKind, string> = {
  current: 'Current',
  savings: 'Savings',
  client_money: 'Client money',
  tenant_deposit: 'Tenant deposit',
}

type EntityOption = { id: string; name: string }

type Props =
  | {
      mode: 'create'
      accountId?: undefined
      entities: EntityOption[]
      initial?: Partial<BankAccountCreate>
    }
  | {
      mode: 'edit'
      accountId: string
      entities: EntityOption[]
      initial: BankAccountCreate
    }

export function BankAccountForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<BankAccountCreate>({
    resolver: zodResolver(BankAccountCreateSchema),
    defaultValues: {
      entityId: '',
      label: '',
      bankName: null,
      kind: 'current',
      sortCode: null,
      accountNumberLast4: null,
      openingBalancePence: 0n,
      openingBalanceDate: new Date(),
      notes: null,
      ...props.initial,
    },
  })

  const errors = form.formState.errors

  const onSubmit = (data: BankAccountCreate) => {
    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await createBankAccount(data)
          : await updateBankAccount(props.accountId, data)

      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof BankAccountCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      router.push('/bank-accounts')
      router.refresh()
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      {errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <FormSection title="Basics">
        <FormField label="Entity" required error={errors.entityId?.message} htmlFor="ba-entity" fullWidth>
          <Select id="ba-entity" {...form.register('entityId')}>
            <option value="">Select an entity…</option>
            {props.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Name" required error={errors.label?.message} htmlFor="ba-label" fullWidth>
          <Input id="ba-label" {...form.register('label')} placeholder="Trading current account" />
        </FormField>
        <FormField label="Bank name" error={errors.bankName?.message} htmlFor="ba-bank">
          <Input id="ba-bank" {...form.register('bankName')} placeholder="NatWest" />
        </FormField>
        <FormField label="Kind" error={errors.kind?.message} htmlFor="ba-kind">
          <Select id="ba-kind" {...form.register('kind')}>
            {BANK_ACCOUNT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
        <FormField
          label="Sort code"
          hint="6 digits"
          error={errors.sortCode?.message}
          htmlFor="ba-sc"
        >
          <Input id="ba-sc" {...form.register('sortCode')} placeholder="12-34-56" />
        </FormField>
        <FormField
          label="Last 4 of account number"
          error={errors.accountNumberLast4?.message}
          htmlFor="ba-an"
        >
          <Input id="ba-an" {...form.register('accountNumberLast4')} placeholder="1234" />
        </FormField>
      </FormSection>

      <FormSection title="Opening balance">
        <FormField
          label="Balance (£)"
          required
          error={errors.openingBalancePence?.message}
          htmlFor="ba-bal"
        >
          <Input id="ba-bal" inputMode="decimal" {...form.register('openingBalancePence')} />
        </FormField>
        <FormField
          label="As at"
          required
          error={errors.openingBalanceDate?.message}
          htmlFor="ba-date"
        >
          <Input id="ba-date" type="date" {...form.register('openingBalanceDate')} />
        </FormField>
        <FormField label="Notes" error={errors.notes?.message} htmlFor="ba-notes" fullWidth>
          <Textarea id="ba-notes" rows={3} {...form.register('notes')} />
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? props.mode === 'create' ? 'Creating…' : 'Saving…'
            : props.mode === 'create' ? 'Create account' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
