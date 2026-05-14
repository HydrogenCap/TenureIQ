// app/(app)/entities/_components/entity-form.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  EntityCreateSchema,
  ENTITY_KINDS,
  type EntityCreate,
  type EntityKind,
} from '@/lib/schemas/entity'
import { createEntity, updateEntity } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

type Props =
  | { mode: 'create'; entityId?: undefined; initial?: Partial<EntityCreate> }
  | { mode: 'edit'; entityId: string; initial: EntityCreate }

const KIND_LABELS: Record<EntityKind, string> = {
  ltd: 'Limited company',
  llp: 'LLP',
  individual: 'Individual',
  spv: 'SPV',
}

export function EntityForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<EntityCreate>({
    resolver: zodResolver(EntityCreateSchema),
    defaultValues: {
      name: '',
      kind: 'ltd',
      companiesHouseNumber: null,
      registeredAddress: null,
      hmrcUtr: null,
      vatNumber: null,
      yearEndMonth: null,
      yearEndDay: null,
      notes: null,
      ...props.initial,
    },
  })

  const kind = form.watch('kind')
  const showCompanyFields = kind === 'ltd' || kind === 'llp' || kind === 'spv'

  const onSubmit = (data: EntityCreate) => {
    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await createEntity(data)
          : await updateEntity(props.entityId, data)

      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof EntityCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      if (props.mode === 'create' && result.data) {
        router.push(`/entities/${result.data.id}`)
      } else {
        router.push(`/entities/${props.entityId}`)
        router.refresh()
      }
    })
  }

  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      {errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <FormSection title="Basics">
        <FormField label="Name" required error={errors.name?.message} htmlFor="entity-name" fullWidth>
          <Input id="entity-name" {...form.register('name')} />
        </FormField>

        <FormField label="Kind" required error={errors.kind?.message} htmlFor="entity-kind">
          <Select id="entity-kind" {...form.register('kind')}>
            {ENTITY_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
      </FormSection>

      {showCompanyFields && (
        <FormSection title="Companies House & tax">
          <FormField
            label="Companies House number"
            hint="6–10 alphanumeric (e.g. 12345678)"
            error={errors.companiesHouseNumber?.message}
            htmlFor="entity-ch"
          >
            <Input id="entity-ch" {...form.register('companiesHouseNumber')} />
          </FormField>

          <FormField label="HMRC UTR" hint="10 digits" error={errors.hmrcUtr?.message} htmlFor="entity-utr">
            <Input id="entity-utr" {...form.register('hmrcUtr')} />
          </FormField>

          <FormField label="VAT number" error={errors.vatNumber?.message} htmlFor="entity-vat">
            <Input id="entity-vat" {...form.register('vatNumber')} />
          </FormField>

          <FormField
            label="Registered address"
            error={errors.registeredAddress?.message}
            htmlFor="entity-reg"
            fullWidth
          >
            <Textarea id="entity-reg" rows={2} {...form.register('registeredAddress')} />
          </FormField>

          <FormField
            label="Year-end month"
            error={errors.yearEndMonth?.message}
            htmlFor="entity-ye-month"
          >
            <Input
              id="entity-ye-month"
              type="number"
              min={1}
              max={12}
              {...form.register('yearEndMonth')}
            />
          </FormField>
          <FormField
            label="Year-end day"
            error={errors.yearEndDay?.message}
            htmlFor="entity-ye-day"
          >
            <Input
              id="entity-ye-day"
              type="number"
              min={1}
              max={31}
              {...form.register('yearEndDay')}
            />
          </FormField>
        </FormSection>
      )}

      <FormSection title="Notes">
        <FormField label="Notes" error={errors.notes?.message} htmlFor="entity-notes" fullWidth>
          <Textarea id="entity-notes" rows={4} {...form.register('notes')} />
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? props.mode === 'create'
              ? 'Creating…'
              : 'Saving…'
            : props.mode === 'create'
              ? 'Create entity'
              : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
