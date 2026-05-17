'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  ComplianceItemCreateSchema,
  COMPLIANCE_KINDS,
  type ComplianceItemCreate,
  type ComplianceKind,
} from '@/lib/schemas/compliance-item'
import { createComplianceItem, updateComplianceItem } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

const KIND_LABELS: Record<ComplianceKind, string> = {
  gas_safety: 'Gas safety',
  eicr: 'EICR',
  epc: 'EPC',
  pat: 'PAT',
  hmo_licence: 'HMO licence',
  fire_risk_assessment: 'Fire risk assessment',
  emergency_lighting: 'Emergency lighting',
  fire_alarm_test: 'Fire alarm test',
  fire_alarm: 'Fire alarm',
  legionella: 'Legionella',
  asbestos_survey: 'Asbestos survey',
  asbestos: 'Asbestos',
  oil_safety: 'Oil safety',
  co_alarm: 'CO alarm',
  smoke_alarm: 'Smoke alarm',
  deposit_protection: 'Deposit protection',
  right_to_rent: 'Right to rent',
  insurance: 'Insurance',
  other: 'Other',
}

type PropertyOption = { id: string; name: string }

type Props =
  | {
      mode: 'create'
      itemId?: undefined
      properties: PropertyOption[]
      initial?: Partial<ComplianceItemCreate>
    }
  | {
      mode: 'edit'
      itemId: string
      properties: PropertyOption[]
      initial: ComplianceItemCreate
    }

export function ComplianceItemForm(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<ComplianceItemCreate>({
    resolver: zodResolver(ComplianceItemCreateSchema),
    defaultValues: {
      propertyId: '',
      unitId: null,
      kind: 'gas_safety',
      issueDate: null,
      expiryDate: null,
      issuer: null,
      documentId: null,
      notes: null,
      ...props.initial,
    },
  })

  const errors = form.formState.errors

  const onSubmit = (data: ComplianceItemCreate) => {
    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await createComplianceItem(data)
          : await updateComplianceItem(props.itemId, data)
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof ComplianceItemCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      router.push('/compliance')
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

      <FormSection title="Subject">
        <FormField label="Property" required error={errors.propertyId?.message} htmlFor="c-prop" fullWidth>
          <Select id="c-prop" {...form.register('propertyId')}>
            <option value="">Select a property…</option>
            {props.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Kind" required error={errors.kind?.message} htmlFor="c-kind">
          <Select id="c-kind" {...form.register('kind')}>
            {COMPLIANCE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
        <FormField label="Issuer / certifier" error={errors.issuer?.message} htmlFor="c-issuer">
          <Input id="c-issuer" {...form.register('issuer')} placeholder="Gas Safe engineer, surveyor, council…" />
        </FormField>
      </FormSection>

      <FormSection title="Dates">
        <FormField label="Issued" error={errors.issueDate?.message} htmlFor="c-issue">
          <Input id="c-issue" type="date" {...form.register('issueDate')} />
        </FormField>
        <FormField
          label="Expires"
          hint="Status auto-derives: ≤60 days = expiring; past = expired."
          error={errors.expiryDate?.message}
          htmlFor="c-expiry"
        >
          <Input id="c-expiry" type="date" {...form.register('expiryDate')} />
        </FormField>
      </FormSection>

      <FormSection title="Notes">
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
            ? props.mode === 'create' ? 'Recording…' : 'Saving…'
            : props.mode === 'create' ? 'Record certificate' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
