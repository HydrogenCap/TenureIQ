// app/(app)/properties/[id]/units/_components/unit-form.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  UnitCreateSchema,
  UNIT_STATUSES,
  type UnitCreate,
  type UnitStatus,
} from '@/lib/schemas/unit'
import { createUnit, updateUnit } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

const STATUS_LABELS: Record<UnitStatus, string> = {
  vacant: 'Vacant',
  occupied: 'Occupied',
  reserved: 'Reserved',
  maintenance: 'Maintenance',
  offline: 'Offline',
}

type Props =
  | { mode: 'create'; propertyId: string; unitId?: undefined; initial?: Partial<UnitCreate> }
  | { mode: 'edit'; propertyId: string; unitId: string; initial: UnitCreate }

export function UnitForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<UnitCreate>({
    resolver: zodResolver(UnitCreateSchema),
    defaultValues: {
      label: '',
      bedrooms: 1,
      bathroomsEnsuite: false,
      floorAreaSqm: null,
      marketRentPence: null,
      status: 'vacant',
      notes: null,
      ...props.initial,
    },
  })

  const errors = form.formState.errors

  const onSubmit = (data: UnitCreate) => {
    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await createUnit(props.propertyId, data)
          : await updateUnit(props.propertyId, props.unitId, data)

      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof UnitCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      router.push(`/properties/${props.propertyId}?tab=units`)
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
        <FormField label="Label" required error={errors.label?.message} htmlFor="u-label" fullWidth>
          <Input id="u-label" placeholder="Room 1, Flat A, …" {...form.register('label')} />
        </FormField>
        <FormField label="Bedrooms" error={errors.bedrooms?.message} htmlFor="u-bed">
          <Input id="u-bed" type="number" min={0} {...form.register('bedrooms')} />
        </FormField>
        <FormField label="Floor area (m²)" error={errors.floorAreaSqm?.message} htmlFor="u-area">
          <Input id="u-area" inputMode="decimal" {...form.register('floorAreaSqm')} />
        </FormField>
        <FormField label="En-suite bathroom" htmlFor="u-ensuite">
          <div className="flex items-center gap-2 py-2">
            <Checkbox id="u-ensuite" {...form.register('bathroomsEnsuite')} />
            <span className="text-sm">Has en-suite</span>
          </div>
        </FormField>
        <FormField
          label="Market rent (£/month)"
          hint="What you'd advertise this unit at today. Optional."
          error={errors.marketRentPence?.message}
          htmlFor="u-rent"
        >
          <Input id="u-rent" inputMode="decimal" {...form.register('marketRentPence')} />
        </FormField>
        <FormField label="Status" error={errors.status?.message} htmlFor="u-status">
          <Select id="u-status" {...form.register('status')}>
            {UNIT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </Select>
        </FormField>
        <FormField label="Notes" error={errors.notes?.message} htmlFor="u-notes" fullWidth>
          <Textarea id="u-notes" rows={3} {...form.register('notes')} />
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? props.mode === 'create' ? 'Creating…' : 'Saving…'
            : props.mode === 'create' ? 'Create unit' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
