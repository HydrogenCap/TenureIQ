'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  AascPlacementCreateSchema,
  type AascPlacementCreate,
} from '@/lib/schemas/aasc'
import { createPlacement } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

export type ContractOpt = {
  id: string
  contractor: string
  reference: string | null
}
export type PropertyOpt = {
  id: string
  addressLine1: string
  postcode: string
  isAasc: boolean
}
export type UnitOpt = { id: string; label: string; propertyId: string }

type Props = {
  contracts: ContractOpt[]
  properties: PropertyOpt[]
  units: UnitOpt[]
  initialContractId?: string
  initialPropertyId?: string
}

export function PlacementForm({
  contracts,
  properties,
  units,
  initialContractId,
  initialPropertyId,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Shown only after the server refused with the closed-area error;
  // stays visible so the user can tick it and resubmit.
  const [showClosedAreaOverride, setShowClosedAreaOverride] = useState(false)

  const form = useForm<AascPlacementCreate>({
    resolver: zodResolver(AascPlacementCreateSchema),
    defaultValues: {
      contractId: initialContractId ?? '',
      propertyId: initialPropertyId ?? '',
      unitId: null,
      placementRef: '',
      weeklyRatePence: 0n,
      commissionRateBpsOverride: null,
      serviceUserCount: 1,
      startDate: new Date(),
      endDateExpected: null,
      overrideClosedArea: false,
    },
  })

  const propertyId = form.watch('propertyId')
  const eligibleUnits = units.filter((u) => u.propertyId === propertyId)
  const selectedProperty = properties.find((p) => p.id === propertyId)
  const propertyNotAasc =
    selectedProperty !== undefined && !selectedProperty.isAasc

  const errors = form.formState.errors

  const onSubmit = (data: AascPlacementCreate) => {
    setSubmitError(null)
    startTransition(async () => {
      const result = await createPlacement(data)
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) {
              form.setError(field as keyof AascPlacementCreate, { message: first })
            }
          }
        }
        if (result.error.includes('Override closed-area warning')) {
          setShowClosedAreaOverride(true)
        }
        setSubmitError(result.error)
        return
      }
      router.push(`/aasc/placements/${result.data.id}`)
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      <Alert>
        <AlertTitle>Identity-free</AlertTitle>
        <AlertDescription>
          This form intentionally captures NO service-user identity. No names, DoB,
          nationality, passport or Home Office reference. Only a placement reference
          + count of users. The database enforces the same rule.
        </AlertDescription>
      </Alert>

      {submitError && (
        <Alert variant="destructive">
          <AlertTitle>Could not create placement</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {propertyNotAasc && (
        <Alert variant="destructive">
          <AlertTitle>Property is not flagged AASC</AlertTitle>
          <AlertDescription>
            Edit the property and turn on &quot;Used for asylum accommodation&quot; before
            adding placements.
          </AlertDescription>
        </Alert>
      )}

      <FormSection title="Contract & property">
        <FormField label="Contract" required error={errors.contractId?.message} htmlFor="p-contract" fullWidth>
          <Select id="p-contract" {...form.register('contractId')}>
            <option value="">Select a contract…</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.contractor} — {c.reference ?? c.id.slice(0, 8)}</option>)}
          </Select>
        </FormField>
        <FormField label="Property" required error={errors.propertyId?.message} htmlFor="p-prop" fullWidth>
          <Select id="p-prop" {...form.register('propertyId')}>
            <option value="">Select a property…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.addressLine1}, {p.postcode}{p.isAasc ? '' : ' (not AASC)'}</option>)}
          </Select>
        </FormField>
        {eligibleUnits.length > 0 && (
          <FormField label="Unit (optional)" htmlFor="p-unit" fullWidth>
            <Select id="p-unit" {...form.register('unitId')}>
              <option value="">Whole property</option>
              {eligibleUnits.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          </FormField>
        )}
      </FormSection>

      <FormSection title="Placement details">
        <FormField label="Placement reference" required error={errors.placementRef?.message} htmlFor="p-ref">
          <Input id="p-ref" {...form.register('placementRef')} />
        </FormField>
        <FormField
          label="Service-user count"
          required
          error={errors.serviceUserCount?.message}
          htmlFor="p-count"
        >
          <Input id="p-count" type="number" min={1} max={50} {...form.register('serviceUserCount')} />
        </FormField>
        <FormField
          label="Rate (£ / week)"
          hint="For Clearsprings: capped at LHA SAR × 1.40 — server-side check applies."
          required
          error={errors.weeklyRatePence?.message}
          htmlFor="p-rate"
        >
          <Input id="p-rate" inputMode="decimal" {...form.register('weeklyRatePence')} />
        </FormField>
        <FormField
          label="Commission override (%)"
          hint="Leave blank to inherit the contract's commission rate."
          error={errors.commissionRateBpsOverride?.message}
          htmlFor="p-comm"
        >
          <Input id="p-comm" inputMode="decimal" {...form.register('commissionRateBpsOverride')} />
        </FormField>
        <FormField label="Start date" required error={errors.startDate?.message} htmlFor="p-start">
          <Input id="p-start" type="date" {...form.register('startDate')} />
        </FormField>
        <FormField
          label="Expected end"
          hint="When the placement is scheduled to end (optional)."
          error={errors.endDateExpected?.message}
          htmlFor="p-end"
        >
          <Input id="p-end" type="date" {...form.register('endDateExpected')} />
        </FormField>
      </FormSection>

      {showClosedAreaOverride && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
          <Checkbox
            id="p-override-closed"
            className="mt-0.5"
            {...form.register('overrideClosedArea')}
          />
          <label htmlFor="p-override-closed" className="text-sm">
            <span className="font-medium">Override closed-area warning.</span>{' '}
            Create this placement even though the contractor has closed the
            property&apos;s local-authority area. The override is recorded in the
            audit log.
          </label>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending || propertyNotAasc}
        >
          {pending ? 'Creating…' : 'Create placement'}
        </Button>
      </div>
    </form>
  )
}
