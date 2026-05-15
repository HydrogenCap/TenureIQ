// app/(app)/tenancies/_components/tenancy-form.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  TenancyCreateSchema,
  TENANCY_KINDS,
  RENT_PERIODS,
  DEPOSIT_SCHEMES,
  type TenancyCreate,
  type TenancyKind,
  type RentPeriod,
  type DepositScheme,
} from '@/lib/schemas/tenancy'
import { createTenancy } from '../actions'
import { meesStatus, type EpcBand } from '@/lib/domain/mees'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

const KIND_LABELS: Record<TenancyKind, string> = {
  ast: 'AST',
  licence: 'Licence',
  aasc_placement: 'AASC placement',
  company_let: 'Company let',
  holiday_let: 'Holiday let',
}

const PERIOD_LABELS: Record<RentPeriod, string> = {
  weekly: 'Weekly',
  four_weekly: 'Four-weekly',
  monthly: 'Monthly',
  annual: 'Annual',
}

const SCHEME_LABELS: Record<DepositScheme, string> = {
  dps: 'DPS',
  mydeposits: 'mydeposits',
  tds: 'TDS',
  none: 'None',
}

export type PropertyOption = {
  id: string
  addressLine1: string
  postcode: string
  epcRating: EpcBand | null
  epcExpiry: string | null
}
export type UnitOption = { id: string; label: string; propertyId: string }

export function TenancyForm({
  properties,
  units,
  initialPropertyId,
}: {
  properties: PropertyOption[]
  units: UnitOption[]
  initialPropertyId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const form = useForm<TenancyCreate>({
    resolver: zodResolver(TenancyCreateSchema),
    defaultValues: {
      propertyId: initialPropertyId ?? '',
      unitId: null,
      kind: 'ast',
      startDate: new Date(),
      endDateIntended: null,
      rentPence: 0n,
      rentPeriod: 'monthly',
      depositPence: null,
      depositScheme: null,
      depositSchemeRef: null,
      aascPlacementRef: null,
      aascContractor: null,
      notes: null,
      tenants: [
        {
          firstName: '',
          lastName: '',
          email: null,
          phone: null,
          rightToRentChecked: false,
          rightToRentExpiry: null,
          notes: null,
        },
      ],
    },
  })

  const tenants = useFieldArray({ control: form.control, name: 'tenants' })

  const propertyId = form.watch('propertyId')
  const kind = form.watch('kind')

  const selectedProperty = properties.find((p) => p.id === propertyId)
  const eligibleUnits = units.filter((u) => u.propertyId === propertyId)

  // Pre-flight MEES warning so the user doesn't waste time filling the form.
  const meesWarning =
    selectedProperty &&
    meesStatus(selectedProperty.epcRating, selectedProperty.epcExpiry) === 'let_blocked'
      ? `EPC ${selectedProperty.epcRating ?? '?'} — this property cannot be let until the rating is improved or an MEES exemption is registered.`
      : null

  const showTenants = kind === 'ast' || kind === 'licence' || kind === 'company_let'

  const onSubmit = (data: TenancyCreate) => {
    setSubmitError(null)
    startTransition(async () => {
      const result = await createTenancy(data)
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof TenancyCreate, { message: first })
          }
        }
        setSubmitError(result.error)
        return
      }
      router.push(`/tenancies/${result.data.id}`)
    })
  }

  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      {submitError && (
        <Alert variant="destructive">
          <AlertTitle>Could not create tenancy</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {meesWarning && (
        <Alert variant="destructive">
          <AlertTitle>MEES — let blocked</AlertTitle>
          <AlertDescription>{meesWarning}</AlertDescription>
        </Alert>
      )}

      <FormSection title="Property & unit">
        <FormField label="Property" required error={errors.propertyId?.message} htmlFor="t-prop" fullWidth>
          <Select id="t-prop" {...form.register('propertyId')}>
            <option value="">Select a property…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.addressLine1}, {p.postcode}</option>)}
          </Select>
        </FormField>

        {eligibleUnits.length > 0 && (
          <FormField label="Unit" hint="Optional — whole-property lets leave blank." htmlFor="t-unit" fullWidth>
            <Select id="t-unit" {...form.register('unitId')}>
              <option value="">Whole property (no unit)</option>
              {eligibleUnits.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          </FormField>
        )}

        <FormField label="Kind" required error={errors.kind?.message} htmlFor="t-kind">
          <Select id="t-kind" {...form.register('kind')}>
            {TENANCY_KINDS.filter((k) => k !== 'aasc_placement').map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
      </FormSection>

      <FormSection title="Dates & financials">
        <FormField label="Start date" required error={errors.startDate?.message} htmlFor="t-start">
          <Input id="t-start" type="date" {...form.register('startDate')} />
        </FormField>
        <FormField label="Intended end date" hint="Fixed-term AST end. Optional for periodic." htmlFor="t-endi">
          <Input id="t-endi" type="date" {...form.register('endDateIntended')} />
        </FormField>
        <FormField label="Rent (£)" required error={errors.rentPence?.message} htmlFor="t-rent">
          <Input id="t-rent" inputMode="decimal" {...form.register('rentPence')} />
        </FormField>
        <FormField label="Period" error={errors.rentPeriod?.message} htmlFor="t-period">
          <Select id="t-period" {...form.register('rentPeriod')}>
            {RENT_PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
          </Select>
        </FormField>
        <FormField label="Deposit (£)" error={errors.depositPence?.message} htmlFor="t-dep">
          <Input id="t-dep" inputMode="decimal" {...form.register('depositPence')} />
        </FormField>
        <FormField label="Deposit scheme" error={errors.depositScheme?.message} htmlFor="t-scheme">
          <Select id="t-scheme" {...form.register('depositScheme')}>
            <option value="">Not set</option>
            {DEPOSIT_SCHEMES.map((s) => <option key={s} value={s}>{SCHEME_LABELS[s]}</option>)}
          </Select>
        </FormField>
        <FormField label="Deposit ref" hint="Scheme reference number." htmlFor="t-sref" fullWidth>
          <Input id="t-sref" {...form.register('depositSchemeRef')} />
        </FormField>
      </FormSection>

      {showTenants && (
        <FormSection title="Tenants">
          {tenants.fields.map((field, idx) => {
            const tErrors = errors.tenants?.[idx]
            return (
              <div key={field.id} className="sm:col-span-2 space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Tenant {idx + 1}
                    {idx === 0 && <span className="ml-2 text-xs text-muted-foreground">(lead)</span>}
                  </p>
                  {tenants.fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => tenants.remove(idx)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    label="First name"
                    required
                    error={tErrors?.firstName?.message}
                    htmlFor={`t-fn-${idx}`}
                  >
                    <Input id={`t-fn-${idx}`} {...form.register(`tenants.${idx}.firstName`)} />
                  </FormField>
                  <FormField
                    label="Last name"
                    required
                    error={tErrors?.lastName?.message}
                    htmlFor={`t-ln-${idx}`}
                  >
                    <Input id={`t-ln-${idx}`} {...form.register(`tenants.${idx}.lastName`)} />
                  </FormField>
                  <FormField
                    label="Email"
                    error={tErrors?.email?.message}
                    htmlFor={`t-em-${idx}`}
                  >
                    <Input
                      id={`t-em-${idx}`}
                      type="email"
                      {...form.register(`tenants.${idx}.email`)}
                    />
                  </FormField>
                  <FormField
                    label="Phone"
                    error={tErrors?.phone?.message}
                    htmlFor={`t-ph-${idx}`}
                  >
                    <Input id={`t-ph-${idx}`} {...form.register(`tenants.${idx}.phone`)} />
                  </FormField>
                  <FormField label="Right-to-rent checked" htmlFor={`t-rtr-${idx}`}>
                    <div className="flex items-center gap-2 py-2">
                      <Checkbox
                        id={`t-rtr-${idx}`}
                        {...form.register(`tenants.${idx}.rightToRentChecked`)}
                      />
                      <span className="text-sm">Documented</span>
                    </div>
                  </FormField>
                  <FormField
                    label="Right-to-rent expiry"
                    error={tErrors?.rightToRentExpiry?.message}
                    htmlFor={`t-rtre-${idx}`}
                  >
                    <Input
                      id={`t-rtre-${idx}`}
                      type="date"
                      {...form.register(`tenants.${idx}.rightToRentExpiry`)}
                    />
                  </FormField>
                </div>
              </div>
            )
          })}
          {tenants.fields.length < 4 && (
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  tenants.append({
                    firstName: '',
                    lastName: '',
                    email: null,
                    phone: null,
                    rightToRentChecked: false,
                    rightToRentExpiry: null,
                    notes: null,
                  })
                }
              >
                + Add joint tenant
              </Button>
            </div>
          )}
          {errors.tenants?.message && (
            <p className="sm:col-span-2 text-xs text-destructive">{errors.tenants.message}</p>
          )}
        </FormSection>
      )}

      <FormSection title="Notes">
        <FormField label="Notes" error={errors.notes?.message} htmlFor="t-notes" fullWidth>
          <Textarea id="t-notes" rows={3} {...form.register('notes')} />
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !!meesWarning}>
          {pending ? 'Creating…' : 'Create tenancy'}
        </Button>
      </div>
    </form>
  )
}
