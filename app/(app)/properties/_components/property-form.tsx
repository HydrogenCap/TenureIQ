// app/(app)/properties/_components/property-form.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  PropertyCreateSchema,
  PROPERTY_KINDS,
  HMO_LICENCE_KINDS,
  EPC_RATINGS,
  type PropertyCreate,
} from '@/lib/schemas/property'
import { createProperty, updateProperty } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

type EntityOption = { id: string; name: string }

type Props =
  | { mode: 'create'; propertyId?: undefined; initial?: Partial<PropertyCreate>; entities: EntityOption[] }
  | { mode: 'edit'; propertyId: string; initial: PropertyCreate; entities: EntityOption[] }

const PROPERTY_KIND_LABELS: Record<(typeof PROPERTY_KINDS)[number], string> = {
  hmo: 'HMO',
  single_let: 'Single let',
  block: 'Block',
  commercial: 'Commercial',
  development: 'Development',
  land: 'Land',
}

const HMO_LABELS: Record<(typeof HMO_LICENCE_KINDS)[number], string> = {
  none: 'None',
  mandatory: 'Mandatory',
  additional: 'Additional',
  selective: 'Selective',
}

export function PropertyForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<PropertyCreate>({
    resolver: zodResolver(PropertyCreateSchema),
    defaultValues: {
      entityId: '',
      addressLine1: '',
      addressLine2: null,
      city: '',
      county: null,
      postcode: '',
      localAuthority: null,
      brmaCode: null,
      kind: 'hmo',
      classUse: null,
      bedroomsTotal: null,
      bathroomsTotal: null,
      purchasePricePence: 0n,
      purchaseDate: new Date(),
      sdltPaidPence: null,
      refurbCostPence: null,
      acquisitionCostsPence: null,
      epcRating: null,
      epcExpiry: null,
      hmoLicenceKind: 'none',
      hmoLicenceRef: null,
      hmoLicenceExpiry: null,
      hmoPermittedOccupancy: null,
      article4Area: false,
      isAascProperty: false,
      notes: null,
      ...props.initial,
    },
  })

  const hmoKind = form.watch('hmoLicenceKind')
  const showHmoDetails = hmoKind !== 'none'

  const onSubmit = (data: PropertyCreate) => {
    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await createProperty(data)
          : await updateProperty(props.propertyId, data)

      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof PropertyCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      if (props.mode === 'create' && result.data) {
        router.push(`/properties/${result.data.id}`)
      } else {
        router.push(`/properties/${props.propertyId}`)
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
        <FormField label="Entity" required error={errors.entityId?.message} htmlFor="p-entity">
          <Select id="p-entity" {...form.register('entityId')}>
            <option value="">Select an entity…</option>
            {props.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Kind" required error={errors.kind?.message} htmlFor="p-kind">
          <Select id="p-kind" {...form.register('kind')}>
            {PROPERTY_KINDS.map((k) => <option key={k} value={k}>{PROPERTY_KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
        <FormField
          label="Address line 1"
          required
          error={errors.addressLine1?.message}
          htmlFor="p-addr1"
          fullWidth
        >
          <Input id="p-addr1" {...form.register('addressLine1')} />
        </FormField>
        <FormField label="Address line 2" error={errors.addressLine2?.message} htmlFor="p-addr2" fullWidth>
          <Input id="p-addr2" {...form.register('addressLine2')} />
        </FormField>
        <FormField label="City" required error={errors.city?.message} htmlFor="p-city">
          <Input id="p-city" {...form.register('city')} />
        </FormField>
        <FormField label="County" error={errors.county?.message} htmlFor="p-county">
          <Input id="p-county" {...form.register('county')} />
        </FormField>
        <FormField label="Postcode" required error={errors.postcode?.message} htmlFor="p-postcode">
          <Input id="p-postcode" {...form.register('postcode')} placeholder="HR4 9TZ" />
        </FormField>
        <FormField label="Local authority" error={errors.localAuthority?.message} htmlFor="p-la">
          <Input id="p-la" {...form.register('localAuthority')} />
        </FormField>
      </FormSection>

      <FormSection title="Acquisition">
        <FormField
          label="Purchase price (£)"
          required
          error={errors.purchasePricePence?.message}
          htmlFor="p-price"
        >
          <Input id="p-price" inputMode="decimal" {...form.register('purchasePricePence')} />
        </FormField>
        <FormField
          label="Purchase date"
          required
          error={errors.purchaseDate?.message}
          htmlFor="p-date"
        >
          <Input id="p-date" type="date" {...form.register('purchaseDate')} />
        </FormField>
        <FormField
          label="SDLT paid (£)"
          error={errors.sdltPaidPence?.message}
          htmlFor="p-sdlt"
        >
          <Input id="p-sdlt" inputMode="decimal" {...form.register('sdltPaidPence')} />
        </FormField>
        <FormField
          label="Refurb spend (£)"
          error={errors.refurbCostPence?.message}
          htmlFor="p-refurb"
        >
          <Input id="p-refurb" inputMode="decimal" {...form.register('refurbCostPence')} />
        </FormField>
        <FormField
          label="Other acquisition costs (£)"
          error={errors.acquisitionCostsPence?.message}
          htmlFor="p-acq"
        >
          <Input id="p-acq" inputMode="decimal" {...form.register('acquisitionCostsPence')} />
        </FormField>
      </FormSection>

      <FormSection title="Energy">
        <FormField label="EPC rating" error={errors.epcRating?.message} htmlFor="p-epc">
          <Select id="p-epc" {...form.register('epcRating')}>
            <option value="">Unknown</option>
            {EPC_RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </FormField>
        <FormField label="EPC expiry" error={errors.epcExpiry?.message} htmlFor="p-epcexp">
          <Input id="p-epcexp" type="date" {...form.register('epcExpiry')} />
        </FormField>
      </FormSection>

      <FormSection title="HMO licensing">
        <FormField label="Licence" error={errors.hmoLicenceKind?.message} htmlFor="p-hmo">
          <Select id="p-hmo" {...form.register('hmoLicenceKind')}>
            {HMO_LICENCE_KINDS.map((k) => <option key={k} value={k}>{HMO_LABELS[k]}</option>)}
          </Select>
        </FormField>
        {showHmoDetails && (
          <>
            <FormField label="Licence ref" error={errors.hmoLicenceRef?.message} htmlFor="p-hmo-ref">
              <Input id="p-hmo-ref" {...form.register('hmoLicenceRef')} />
            </FormField>
            <FormField label="Expiry" error={errors.hmoLicenceExpiry?.message} htmlFor="p-hmo-exp">
              <Input id="p-hmo-exp" type="date" {...form.register('hmoLicenceExpiry')} />
            </FormField>
            <FormField
              label="Permitted occupancy"
              error={errors.hmoPermittedOccupancy?.message}
              htmlFor="p-hmo-occ"
            >
              <Input
                id="p-hmo-occ"
                type="number"
                min={0}
                {...form.register('hmoPermittedOccupancy')}
              />
            </FormField>
          </>
        )}
      </FormSection>

      <FormSection title="Other">
        <FormField label="Bedrooms" error={errors.bedroomsTotal?.message} htmlFor="p-bed">
          <Input id="p-bed" type="number" min={0} {...form.register('bedroomsTotal')} />
        </FormField>
        <FormField label="Bathrooms" error={errors.bathroomsTotal?.message} htmlFor="p-bath">
          <Input id="p-bath" type="number" min={0} {...form.register('bathroomsTotal')} />
        </FormField>
        <FormField label="Article 4 area" htmlFor="p-a4">
          <div className="flex items-center gap-2 py-2">
            <Checkbox id="p-a4" {...form.register('article4Area')} />
            <span className="text-sm">Subject to Article 4 direction</span>
          </div>
        </FormField>
        <FormField label="AASC property" htmlFor="p-aasc">
          <div className="flex items-center gap-2 py-2">
            <Checkbox id="p-aasc" {...form.register('isAascProperty')} />
            <span className="text-sm">Used for asylum accommodation</span>
          </div>
        </FormField>
        <FormField label="Notes" error={errors.notes?.message} htmlFor="p-notes" fullWidth>
          <Textarea id="p-notes" rows={3} {...form.register('notes')} />
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
              ? 'Create property'
              : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
