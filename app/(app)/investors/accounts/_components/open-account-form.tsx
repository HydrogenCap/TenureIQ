'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'

import {
  ACCOUNT_KINDS,
  type OpenAccountInput,
  type AccountKind,
} from '@/lib/schemas/investor'
import { openAccount } from '../../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'

const KIND_LABELS: Record<AccountKind, string> = {
  preferred_equity: 'Preferred equity',
  common_equity: 'Common equity',
  mezzanine_loan: 'Mezzanine loan',
  straight_loan: 'Straight loan',
}

type Opt = { id: string; name: string }

type Props = {
  investors: Opt[]
  entities: Opt[]
  initialInvestorId?: string
}

// The form carries `termsJson` as a free-text JSON string (parsed at
// submit time) plus the OpenAccountInput fields; `terms` is computed
// from the JSON and dropped before the action call.
type FormShape = Omit<OpenAccountInput, 'terms'> & { termsJson: string }

export function OpenAccountForm({ investors, entities, initialInvestorId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<FormShape>({
    defaultValues: {
      investorId: initialInvestorId ?? '',
      entityId: '',
      kind: 'preferred_equity',
      termsJson: '{ "preferred_return_bps": 800, "paid_quarterly": true }',
      commitmentPence: 0n,
      startDate: new Date(),
    },
  })

  const errors = form.formState.errors

  const onSubmit = (data: FormShape) => {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(data.termsJson) as Record<string, unknown>
    } catch {
      form.setError('termsJson' as keyof FormShape, { message: 'Invalid JSON' })
      return
    }
    startTransition(async () => {
      const result = await openAccount({
        investorId: data.investorId,
        entityId: data.entityId,
        kind: data.kind,
        terms: parsed,
        commitmentPence: data.commitmentPence,
        startDate: data.startDate,
      })
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof FormShape, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      router.push(`/investors/accounts/${result.data.id}`)
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      {errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <FormSection title="Parties">
        <FormField label="Investor" required error={errors.investorId?.message} htmlFor="oa-inv" fullWidth>
          <Select id="oa-inv" {...form.register('investorId')}>
            <option value="">— Select investor —</option>
            {investors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Entity" required error={errors.entityId?.message} htmlFor="oa-ent" fullWidth>
          <Select id="oa-ent" {...form.register('entityId')}>
            <option value="">— Select entity —</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </FormField>
      </FormSection>

      <FormSection title="Terms">
        <FormField label="Kind" required error={errors.kind?.message} htmlFor="oa-kind">
          <Select id="oa-kind" {...form.register('kind')}>
            {ACCOUNT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
        <FormField
          label="Commitment (£)"
          required
          error={errors.commitmentPence?.message}
          htmlFor="oa-com"
        >
          <Input id="oa-com" inputMode="decimal" {...form.register('commitmentPence')} />
        </FormField>
        <FormField label="Start date" required error={errors.startDate?.message} htmlFor="oa-sd">
          <Input id="oa-sd" type="date" {...form.register('startDate')} />
        </FormField>
        <FormField
          label="Terms JSON"
          hint='e.g. { "preferred_return_bps": 800, "paid_quarterly": true }'
          error={errors.termsJson?.message}
          htmlFor="oa-terms"
          fullWidth
        >
          <Textarea id="oa-terms" rows={3} {...form.register('termsJson')} />
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Opening…' : 'Open account'}
        </Button>
      </div>
    </form>
  )
}
