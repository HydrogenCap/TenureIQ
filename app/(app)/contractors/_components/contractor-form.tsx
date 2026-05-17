'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  ContractorCreateSchema,
  CONTRACTOR_KINDS,
  type ContractorCreate,
  type ContractorKind,
} from '@/lib/schemas/maintenance'
import { createContractor, updateContractor } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

const KIND_LABELS: Record<ContractorKind, string> = {
  plumber: 'Plumber',
  electrician: 'Electrician',
  gas_safe: 'Gas Safe',
  locksmith: 'Locksmith',
  cleaner: 'Cleaner',
  gardener: 'Gardener',
  handyman: 'Handyman',
  roofer: 'Roofer',
  damp_specialist: 'Damp specialist',
  pest_control: 'Pest control',
  fire_safety: 'Fire safety',
  epc_assessor: 'EPC assessor',
  general: 'General',
  other: 'Other',
}

type Props =
  | { mode: 'create'; contractorId?: undefined; initial?: Partial<ContractorCreate> }
  | { mode: 'edit'; contractorId: string; initial: ContractorCreate }

export function ContractorForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<ContractorCreate>({
    resolver: zodResolver(ContractorCreateSchema),
    defaultValues: {
      entityId: null,
      name: '',
      kind: 'handyman',
      contactName: null,
      phone: null,
      email: null,
      insuranceExpiry: null,
      accreditations: [],
      notes: null,
      ...props.initial,
    },
  })

  const errors = form.formState.errors

  const onSubmit = (data: ContractorCreate) => {
    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await createContractor(data)
          : await updateContractor(props.contractorId, data)
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof ContractorCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      if (props.mode === 'create' && result.data) {
        router.push(`/contractors/${result.data.id}`)
      } else {
        router.push(`/contractors/${props.contractorId}`)
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

      <FormSection title="Basics">
        <FormField label="Name" required error={errors.name?.message} htmlFor="c-name" fullWidth>
          <Input id="c-name" {...form.register('name')} />
        </FormField>
        <FormField label="Kind" required error={errors.kind?.message} htmlFor="c-kind">
          <Select id="c-kind" {...form.register('kind')}>
            {CONTRACTOR_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
        <FormField label="Contact name" error={errors.contactName?.message} htmlFor="c-contact">
          <Input id="c-contact" {...form.register('contactName')} />
        </FormField>
        <FormField label="Email" error={errors.email?.message} htmlFor="c-email">
          <Input id="c-email" type="email" {...form.register('email')} />
        </FormField>
        <FormField label="Phone" error={errors.phone?.message} htmlFor="c-phone">
          <Input id="c-phone" {...form.register('phone')} />
        </FormField>
      </FormSection>

      <FormSection title="Compliance">
        <FormField
          label="Insurance expiry"
          hint="Reminders fire 60/30/14/7/0/-7 days out."
          error={errors.insuranceExpiry?.message}
          htmlFor="c-ins"
        >
          <Input id="c-ins" type="date" {...form.register('insuranceExpiry')} />
        </FormField>
        <FormField
          label="Accreditations"
          hint="Comma-separated. e.g. Gas Safe 12345, NICEIC"
          error={errors.accreditations?.message}
          htmlFor="c-acc"
          fullWidth
        >
          <Input
            id="c-acc"
            placeholder="Gas Safe 12345, NICEIC"
            defaultValue={
              Array.isArray(props.initial?.accreditations)
                ? props.initial.accreditations.join(', ')
                : ''
            }
            {...form.register('accreditations')}
          />
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
            : props.mode === 'create' ? 'Create contractor' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
