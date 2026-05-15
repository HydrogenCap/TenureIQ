// app/(app)/mortgages/_components/mortgage-form.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  MortgageCreateSchema,
  MORTGAGE_PRODUCTS,
  type MortgageCreate,
  type MortgageProduct,
} from '@/lib/schemas/mortgage'
import { createMortgage, updateMortgage } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

const PRODUCT_LABELS: Record<MortgageProduct, string> = {
  fixed: 'Fixed',
  tracker: 'Tracker',
  svr: 'SVR',
  discount: 'Discount',
  bridging: 'Bridging',
  development: 'Development',
}

export type PropertyOption = { id: string; addressLine1: string; postcode: string }

type Props =
  | { mode: 'create'; mortgageId?: undefined; properties: PropertyOption[]; initial?: Partial<MortgageCreate> }
  | { mode: 'edit'; mortgageId: string; properties: PropertyOption[]; initial: MortgageCreate }

export function MortgageForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<MortgageCreate>({
    resolver: zodResolver(MortgageCreateSchema),
    defaultValues: {
      propertyId: '',
      lender: '',
      accountRef: null,
      product: 'fixed',
      originalLoanPence: 0n,
      currentBalancePence: 0n,
      interestRateBps: 0,
      monthlyPaymentPence: 0n,
      termMonths: 300,
      fixedEndDate: null,
      isInterestOnly: false,
      broker: null,
      notes: null,
      ...props.initial,
    },
  })

  const errors = form.formState.errors

  const onSubmit = (data: MortgageCreate) => {
    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await createMortgage(data)
          : await updateMortgage(props.mortgageId, data)
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof MortgageCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      if (props.mode === 'create' && result.data) {
        router.push(`/mortgages/${result.data.id}`)
      } else {
        router.push(`/mortgages/${props.mortgageId}`)
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

      <FormSection title="Property & lender">
        <FormField label="Property" required error={errors.propertyId?.message} htmlFor="m-prop" fullWidth>
          <Select id="m-prop" {...form.register('propertyId')}>
            <option value="">Select a property…</option>
            {props.properties.map((p) => <option key={p.id} value={p.id}>{p.addressLine1}, {p.postcode}</option>)}
          </Select>
        </FormField>
        <FormField label="Lender" required error={errors.lender?.message} htmlFor="m-lender">
          <Input id="m-lender" {...form.register('lender')} />
        </FormField>
        <FormField label="Account reference" error={errors.accountRef?.message} htmlFor="m-acc">
          <Input id="m-acc" {...form.register('accountRef')} />
        </FormField>
        <FormField label="Broker" error={errors.broker?.message} htmlFor="m-broker">
          <Input id="m-broker" {...form.register('broker')} />
        </FormField>
      </FormSection>

      <FormSection title="Product">
        <FormField label="Product" required error={errors.product?.message} htmlFor="m-prod">
          <Select id="m-prod" {...form.register('product')}>
            {MORTGAGE_PRODUCTS.map((p) => <option key={p} value={p}>{PRODUCT_LABELS[p]}</option>)}
          </Select>
        </FormField>
        <FormField label="Interest rate" hint="Type 5.25 or 525 (basis points)" required error={errors.interestRateBps?.message} htmlFor="m-rate">
          <Input id="m-rate" inputMode="decimal" placeholder="5.25" {...form.register('interestRateBps')} />
        </FormField>
        <FormField label="Term (months)" required error={errors.termMonths?.message} htmlFor="m-term">
          <Input id="m-term" type="number" min={1} max={600} {...form.register('termMonths')} />
        </FormField>
        <FormField label="Fixed end date" error={errors.fixedEndDate?.message} htmlFor="m-fixed">
          <Input id="m-fixed" type="date" {...form.register('fixedEndDate')} />
        </FormField>
        <FormField label="Interest only?" htmlFor="m-io">
          <div className="flex items-center gap-2 py-2">
            <Checkbox id="m-io" {...form.register('isInterestOnly')} />
            <span className="text-sm">Yes — payments do not reduce balance</span>
          </div>
        </FormField>
      </FormSection>

      <FormSection title="Balances">
        <FormField label="Original loan (£)" required error={errors.originalLoanPence?.message} htmlFor="m-orig">
          <Input id="m-orig" inputMode="decimal" {...form.register('originalLoanPence')} />
        </FormField>
        <FormField label="Current balance (£)" required error={errors.currentBalancePence?.message} htmlFor="m-bal">
          <Input id="m-bal" inputMode="decimal" {...form.register('currentBalancePence')} />
        </FormField>
        <FormField label="Monthly payment (£)" required error={errors.monthlyPaymentPence?.message} htmlFor="m-pay">
          <Input id="m-pay" inputMode="decimal" {...form.register('monthlyPaymentPence')} />
        </FormField>
      </FormSection>

      <FormSection title="Notes">
        <FormField label="Notes" error={errors.notes?.message} htmlFor="m-notes" fullWidth>
          <Textarea id="m-notes" rows={3} {...form.register('notes')} />
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? props.mode === 'create' ? 'Creating…' : 'Saving…'
            : props.mode === 'create' ? 'Create mortgage' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
