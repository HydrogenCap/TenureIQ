'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  ReportJobSchema,
  JOB_KINDS,
  JOB_PRIORITIES,
  type ReportJobInput,
} from '@/lib/schemas/maintenance'
import { reportJob } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

type PropertyOpt = { id: string; name: string }
type UnitOpt = { id: string; label: string; propertyId: string }

type Props = {
  properties: PropertyOpt[]
  units: UnitOpt[]
  initialPropertyId?: string
}

const PRIORITY_LABELS: Record<(typeof JOB_PRIORITIES)[number], string> = {
  emergency: 'Emergency (24h)',
  urgent: 'Urgent (5d)',
  normal: 'Normal (21d)',
  low: 'Low (90d)',
}

const KIND_LABELS: Record<(typeof JOB_KINDS)[number], string> = {
  repair: 'Repair',
  planned_maintenance: 'Planned maintenance',
  inspection: 'Inspection',
  cleaning: 'Cleaning',
  statutory: 'Statutory',
  emergency: 'Emergency',
}

export function ReportJobForm({ properties, units, initialPropertyId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<ReportJobInput>({
    resolver: zodResolver(ReportJobSchema),
    defaultValues: {
      propertyId: initialPropertyId ?? '',
      unitId: null,
      tenancyId: null,
      kind: 'repair',
      priority: 'normal',
      title: '',
      description: null,
    },
  })

  const propertyId = form.watch('propertyId')
  const eligibleUnits = units.filter((u) => u.propertyId === propertyId)
  const errors = form.formState.errors

  const onSubmit = (data: ReportJobInput) => {
    startTransition(async () => {
      const result = await reportJob(data)
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof ReportJobInput, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      router.push(`/maintenance/${result.data.id}`)
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      {errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <FormSection title="What and where">
        <FormField label="Property" required error={errors.propertyId?.message} htmlFor="j-prop" fullWidth>
          <Select id="j-prop" {...form.register('propertyId')}>
            <option value="">Select a property…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormField>
        {eligibleUnits.length > 0 && (
          <FormField label="Unit (optional)" htmlFor="j-unit" fullWidth>
            <Select id="j-unit" {...form.register('unitId')}>
              <option value="">Whole property</option>
              {eligibleUnits.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Title" required error={errors.title?.message} htmlFor="j-title" fullWidth>
          <Input id="j-title" placeholder="e.g. Boiler not heating" {...form.register('title')} />
        </FormField>
        <FormField label="Description" error={errors.description?.message} htmlFor="j-desc" fullWidth>
          <Textarea id="j-desc" rows={4} {...form.register('description')} />
        </FormField>
      </FormSection>

      <FormSection title="Classification">
        <FormField label="Kind" error={errors.kind?.message} htmlFor="j-kind">
          <Select id="j-kind" {...form.register('kind')}>
            {JOB_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
        <FormField
          label="Priority"
          hint="Drives the SLA window: emergency 24h, urgent 5d, normal 21d, low 90d."
          error={errors.priority?.message}
          htmlFor="j-prio"
        >
          <Select id="j-prio" {...form.register('priority')}>
            {JOB_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </Select>
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Reporting…' : 'Report job'}
        </Button>
      </div>
    </form>
  )
}
