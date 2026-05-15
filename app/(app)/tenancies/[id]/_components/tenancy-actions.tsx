// app/(app)/tenancies/[id]/_components/tenancy-actions.tsx
// Client component exposing the give-notice / end / rent-change controls
// on a tenancy detail page. Inline forms rather than modals — fewer moving
// parts and matches the rest of the UI.

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormField } from '@/components/form-field'
import { giveNotice, endTenancy, recordRentChange } from '../../actions'
import { RENT_PERIODS, type RentPeriod } from '@/lib/schemas/tenancy'

type Props = {
  tenancyId: string
  canManage: boolean
  status: string
}

type Mode = 'idle' | 'notice' | 'end' | 'rent'

export function TenancyActions({ tenancyId, canManage, status }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('idle')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!canManage) return null

  const finish = () => {
    setMode('idle')
    setError(null)
    router.refresh()
  }

  // Notice — only on active.
  if (mode === 'notice') {
    return (
      <Panel title="Give notice" onCancel={() => setMode('idle')}>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            startTransition(async () => {
              const result = await giveNotice({
                tenancyId,
                noticeGivenAt: fd.get('noticeGivenAt'),
                vacateDate: fd.get('vacateDate'),
              })
              if (!result.ok) setError(result.error)
              else finish()
            })
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <FormField label="Notice given on" required htmlFor="n-given">
            <Input id="n-given" name="noticeGivenAt" type="date" required />
          </FormField>
          <FormField label="Vacate date" required htmlFor="n-vacate">
            <Input id="n-vacate" name="vacateDate" type="date" required />
          </FormField>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMode('idle')}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Record notice'}
            </Button>
          </div>
        </form>
      </Panel>
    )
  }

  if (mode === 'end') {
    return (
      <Panel title="End tenancy" onCancel={() => setMode('idle')}>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            startTransition(async () => {
              const result = await endTenancy({
                tenancyId,
                endDate: fd.get('endDate'),
                reason: fd.get('reason'),
                notes: fd.get('notes'),
              })
              if (!result.ok) setError(result.error)
              else finish()
            })
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <FormField label="End date" required htmlFor="e-date">
            <Input id="e-date" name="endDate" type="date" required />
          </FormField>
          <FormField label="Reason" htmlFor="e-reason">
            <Select id="e-reason" name="reason" defaultValue="notice_period_expired">
              <option value="notice_period_expired">Notice expired</option>
              <option value="mutual_break">Mutual break</option>
              <option value="eviction">Eviction</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
          <FormField label="Notes" htmlFor="e-notes" fullWidth>
            <Textarea id="e-notes" name="notes" rows={2} />
          </FormField>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMode('idle')}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Ending…' : 'End tenancy'}
            </Button>
          </div>
        </form>
      </Panel>
    )
  }

  if (mode === 'rent') {
    return (
      <Panel title="Record rent change" onCancel={() => setMode('idle')}>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            startTransition(async () => {
              const result = await recordRentChange({
                tenancyId,
                effectiveFrom: fd.get('effectiveFrom'),
                newRentPence: fd.get('newRentPence'),
                newRentPeriod: fd.get('newRentPeriod'),
                reason: fd.get('reason'),
                notes: fd.get('notes'),
              })
              if (!result.ok) setError(result.error)
              else finish()
            })
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <FormField label="Effective from" required htmlFor="r-eff">
            <Input id="r-eff" name="effectiveFrom" type="date" required />
          </FormField>
          <FormField label="New rent (£)" required htmlFor="r-rent">
            <Input id="r-rent" name="newRentPence" inputMode="decimal" required />
          </FormField>
          <FormField label="Period" htmlFor="r-period">
            <Select id="r-period" name="newRentPeriod" defaultValue="monthly">
              {RENT_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </FormField>
          <FormField label="Reason" htmlFor="r-reason">
            <Select id="r-reason" name="reason" defaultValue="review">
              <option value="review">Annual review</option>
              <option value="regeared">Re-geared</option>
              <option value="arrears_negotiation">Arrears negotiation</option>
              <option value="adjustment">Adjustment</option>
            </Select>
          </FormField>
          <FormField label="Notes" htmlFor="r-notes" fullWidth>
            <Textarea id="r-notes" name="notes" rows={2} />
          </FormField>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMode('idle')}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Recording…' : 'Record change'}
            </Button>
          </div>
        </form>
      </Panel>
    )
  }

  // idle
  return (
    <div className="flex flex-wrap gap-2">
      {status === 'active' && (
        <Button variant="outline" onClick={() => setMode('notice')}>
          Give notice
        </Button>
      )}
      {(status === 'active' || status === 'notice_given') && (
        <Button variant="outline" onClick={() => setMode('end')}>
          End tenancy
        </Button>
      )}
      {(status === 'active' || status === 'notice_given') && (
        <Button variant="outline" onClick={() => setMode('rent')}>
          Record rent change
        </Button>
      )}
    </div>
  )
}

function Panel({
  title,
  children,
  onCancel,
}: {
  title: string
  children: React.ReactNode
  onCancel: () => void
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={onCancel}
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  )
}
