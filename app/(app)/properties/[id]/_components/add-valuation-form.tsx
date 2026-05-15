'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormField } from '@/components/form-field'
import { addValuation } from '../valuations/actions'
import { VALUATION_KINDS, type ValuationKind } from '@/lib/schemas/valuation'

const KIND_LABELS: Record<ValuationKind, string> = {
  estimate: 'Owner estimate',
  estate_agent: 'Estate agent appraisal',
  red_book: 'RICS Red Book',
  refinance: 'Refinance valuation',
  purchase: 'Purchase price',
  desktop: 'Desktop / AVM',
}

export function AddValuationForm({ propertyId }: { propertyId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add valuation
      </Button>
    )
  }

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium">Add valuation</h4>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
        >
          ✕
        </button>
      </div>
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(async () => {
            const result = await addValuation({
              propertyId,
              valuationDate: fd.get('valuationDate'),
              valuePence: fd.get('valuePence'),
              kind: fd.get('kind'),
              source: fd.get('source'),
              notes: fd.get('notes'),
            })
            if (!result.ok) {
              setError(result.error)
              return
            }
            setOpen(false)
            setError(null)
            router.refresh()
          })
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <FormField label="Valuation date" required htmlFor="v-date">
          <Input id="v-date" name="valuationDate" type="date" required />
        </FormField>
        <FormField label="Value (£)" required htmlFor="v-val">
          <Input id="v-val" name="valuePence" inputMode="decimal" required />
        </FormField>
        <FormField
          label="Kind"
          hint="RICS Red Book + Refinance + Purchase override the live valuation; others are informational."
          required
          htmlFor="v-kind"
        >
          <Select id="v-kind" name="kind" defaultValue="estimate">
            {VALUATION_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
        <FormField label="Source" hint="Surveyor name, portal, etc." htmlFor="v-src">
          <Input id="v-src" name="source" />
        </FormField>
        <FormField label="Notes" htmlFor="v-notes" fullWidth>
          <Textarea id="v-notes" name="notes" rows={2} />
        </FormField>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save valuation'}
          </Button>
        </div>
      </form>
    </div>
  )
}
