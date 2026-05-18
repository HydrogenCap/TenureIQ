'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  InvestorCreateSchema,
  INVESTOR_KINDS,
  type InvestorCreate,
  type InvestorKind,
} from '@/lib/schemas/investor'
import { createInvestor, updateInvestor } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

const KIND_LABELS: Record<InvestorKind, string> = {
  individual: 'Individual',
  entity: 'Entity (company / LLP)',
  spv: 'SPV',
}

type Props =
  | { mode: 'create'; investorId?: undefined; canEditKyc: boolean; initial?: Partial<InvestorCreate> }
  | { mode: 'edit'; investorId: string; canEditKyc: boolean; initial: InvestorCreate }

export function InvestorForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<InvestorCreate>({
    resolver: zodResolver(InvestorCreateSchema),
    defaultValues: {
      name: '',
      kind: 'individual',
      contactEmail: null,
      contactPhone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postcode: null,
      country: 'GB',
      taxId: null,
      dateOfBirth: null,
      nationalIdKind: null,
      notes: null,
      ...props.initial,
    },
  })

  const errors = form.formState.errors

  const onSubmit = (data: InvestorCreate) => {
    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await createInvestor(data)
          : await updateInvestor(props.investorId, data)
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof InvestorCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      router.push(
        props.mode === 'create' && result.data
          ? `/investors/${result.data.id}`
          : `/investors/${props.investorId}`,
      )
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

      <FormSection title="Identity">
        <FormField label="Name" required error={errors.name?.message} htmlFor="inv-name" fullWidth>
          <Input id="inv-name" {...form.register('name')} />
        </FormField>
        <FormField label="Kind" required error={errors.kind?.message} htmlFor="inv-kind">
          <Select id="inv-kind" {...form.register('kind')}>
            {INVESTOR_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
        <FormField label="Email" error={errors.contactEmail?.message} htmlFor="inv-email">
          <Input id="inv-email" type="email" {...form.register('contactEmail')} />
        </FormField>
        <FormField label="Phone" error={errors.contactPhone?.message} htmlFor="inv-phone">
          <Input id="inv-phone" {...form.register('contactPhone')} />
        </FormField>
      </FormSection>

      <FormSection title="Address">
        <FormField label="Address line 1" error={errors.addressLine1?.message} htmlFor="inv-addr1" fullWidth>
          <Input id="inv-addr1" {...form.register('addressLine1')} />
        </FormField>
        <FormField label="Address line 2" error={errors.addressLine2?.message} htmlFor="inv-addr2" fullWidth>
          <Input id="inv-addr2" {...form.register('addressLine2')} />
        </FormField>
        <FormField label="City" error={errors.city?.message} htmlFor="inv-city">
          <Input id="inv-city" {...form.register('city')} />
        </FormField>
        <FormField label="Postcode" error={errors.postcode?.message} htmlFor="inv-pc">
          <Input id="inv-pc" {...form.register('postcode')} />
        </FormField>
        <FormField label="Country" error={errors.country?.message} htmlFor="inv-country">
          <Input id="inv-country" defaultValue="GB" {...form.register('country')} />
        </FormField>
      </FormSection>

      {props.canEditKyc && (
        <FormSection title="KYC (restricted)">
          <FormField
            label="Tax ID / NI / UTR"
            hint="Owner/admin only. Recorded in the KYC log on read."
            error={errors.taxId?.message}
            htmlFor="inv-tax"
          >
            <Input id="inv-tax" {...form.register('taxId')} />
          </FormField>
          <FormField label="ID kind" error={errors.nationalIdKind?.message} htmlFor="inv-idk">
            <Select id="inv-idk" {...form.register('nationalIdKind')}>
              <option value="">— Not set —</option>
              <option value="ni">National Insurance</option>
              <option value="company_utr">Company UTR</option>
              <option value="passport">Passport</option>
            </Select>
          </FormField>
          <FormField label="Date of birth" error={errors.dateOfBirth?.message} htmlFor="inv-dob">
            <Input id="inv-dob" type="date" {...form.register('dateOfBirth')} />
          </FormField>
        </FormSection>
      )}

      <FormSection title="Notes">
        <FormField label="Notes" error={errors.notes?.message} htmlFor="inv-notes" fullWidth>
          <Textarea id="inv-notes" rows={4} {...form.register('notes')} />
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? props.mode === 'create' ? 'Creating…' : 'Saving…'
            : props.mode === 'create' ? 'Create investor' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
