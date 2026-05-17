'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  AascContractCreateSchema,
  AASC_CONTRACTORS,
  AASC_CONTRACT_KINDS,
  type AascContractCreate,
} from '@/lib/schemas/aasc'
import { createContract, updateContract } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

type EntityOpt = { id: string; name: string }
type BankOpt = { id: string; name: string }

type Props =
  | {
      mode: 'create'
      contractId?: undefined
      entities: EntityOpt[]
      bankAccounts: BankOpt[]
      initial?: Partial<AascContractCreate>
    }
  | {
      mode: 'edit'
      contractId: string
      entities: EntityOpt[]
      bankAccounts: BankOpt[]
      initial: AascContractCreate
    }

export function ContractForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<AascContractCreate>({
    resolver: zodResolver(AascContractCreateSchema),
    defaultValues: {
      entityId: null,
      contractor: 'clearsprings',
      kind: 'direct_lease',
      reference: null,
      startDate: new Date(),
      endDate: null,
      breakClauseDate: null,
      contractedRatePencePerWeek: null,
      commissionRateBps: 0,
      paymentTermsDays: 30,
      payableBankAccountId: null,
      monthlyHeadlinePence: null,
      notes: null,
      ...props.initial,
    },
  })

  const errors = form.formState.errors

  const onSubmit = (data: AascContractCreate) => {
    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await createContract(data)
          : await updateContract(props.contractId, data)
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof AascContractCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      if (props.mode === 'create' && result.data) {
        router.push(`/aasc/contracts/${result.data.id}`)
      } else {
        router.push(`/aasc/contracts/${props.contractId}`)
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

      <FormSection title="Counterparty">
        <FormField label="Contractor" required error={errors.contractor?.message} htmlFor="c-contractor">
          <Select id="c-contractor" {...form.register('contractor')}>
            {AASC_CONTRACTORS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </FormField>
        <FormField label="Kind" error={errors.kind?.message} htmlFor="c-kind">
          <Select id="c-kind" {...form.register('kind')}>
            {AASC_CONTRACT_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
          </Select>
        </FormField>
        <FormField
          label="Entity (lessor)"
          error={errors.entityId?.message}
          htmlFor="c-entity"
          fullWidth
        >
          <Select id="c-entity" {...form.register('entityId')}>
            <option value="">— Org-level —</option>
            {props.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </FormField>
        <FormField
          label="Reference"
          hint="Contractor's contract ID."
          error={errors.reference?.message}
          htmlFor="c-ref"
          fullWidth
        >
          <Input id="c-ref" {...form.register('reference')} />
        </FormField>
        <FormField
          label="Receiving bank account"
          hint="Account the contractor pays into. Used for M5 transaction auto-match."
          error={errors.payableBankAccountId?.message}
          htmlFor="c-bank"
          fullWidth
        >
          <Select id="c-bank" {...form.register('payableBankAccountId')}>
            <option value="">— None —</option>
            {props.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </FormField>
      </FormSection>

      <FormSection title="Dates">
        <FormField label="Start" required error={errors.startDate?.message} htmlFor="c-start">
          <Input id="c-start" type="date" {...form.register('startDate')} />
        </FormField>
        <FormField label="End" error={errors.endDate?.message} htmlFor="c-end">
          <Input id="c-end" type="date" {...form.register('endDate')} />
        </FormField>
        <FormField
          label="Break clause"
          hint="Earliest date either side can terminate."
          error={errors.breakClauseDate?.message}
          htmlFor="c-break"
        >
          <Input id="c-break" type="date" {...form.register('breakClauseDate')} />
        </FormField>
        <FormField
          label="Payment terms (days)"
          error={errors.paymentTermsDays?.message}
          htmlFor="c-pt"
        >
          <Input id="c-pt" type="number" min={0} max={180} {...form.register('paymentTermsDays')} />
        </FormField>
      </FormSection>

      <FormSection title="Rates">
        <FormField
          label="Contracted rate (£ / week)"
          error={errors.contractedRatePencePerWeek?.message}
          htmlFor="c-rate"
        >
          <Input id="c-rate" inputMode="decimal" {...form.register('contractedRatePencePerWeek')} />
        </FormField>
        <FormField
          label="Commission (%)"
          hint="Default rate applied to each placement unless overridden."
          error={errors.commissionRateBps?.message}
          htmlFor="c-comm"
        >
          <Input id="c-comm" inputMode="decimal" placeholder="0" {...form.register('commissionRateBps')} />
        </FormField>
        <FormField
          label="Monthly headline (£)"
          hint="Total monthly figure if the contract specifies one (some agreements bundle rate + services)."
          error={errors.monthlyHeadlinePence?.message}
          htmlFor="c-monthly"
        >
          <Input id="c-monthly" inputMode="decimal" {...form.register('monthlyHeadlinePence')} />
        </FormField>
        <FormField label="Notes" error={errors.notes?.message} htmlFor="c-notes" fullWidth>
          <Textarea id="c-notes" rows={3} {...form.register('notes')} />
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? props.mode === 'create' ? 'Creating…' : 'Saving…'
            : props.mode === 'create' ? 'Create contract' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
