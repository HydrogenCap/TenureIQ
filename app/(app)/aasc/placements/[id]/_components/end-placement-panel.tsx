'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormField } from '@/components/form-field'
import { endPlacement, updateServiceUserCount } from '../../actions'

type Props = {
  placementId: string
  serviceUserCount: number
  canManage: boolean
  active: boolean
}

type Mode = 'idle' | 'end' | 'count'

export function PlacementActionsPanel({
  placementId,
  serviceUserCount,
  canManage,
  active,
}: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('idle')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!canManage) return null

  if (mode === 'end') {
    return (
      <div className="rounded-md border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">End placement</h3>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setMode('idle')}
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
              const result = await endPlacement({
                placementId,
                endDateActual: fd.get('endDateActual'),
                reason: fd.get('reason'),
                notes: fd.get('notes'),
              })
              if (!result.ok) {
                setError(result.error)
                return
              }
              setMode('idle')
              setError(null)
              router.refresh()
            })
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <FormField label="End date" required htmlFor="ep-date">
            <Input id="ep-date" name="endDateActual" type="date" required />
          </FormField>
          <FormField label="Reason" htmlFor="ep-reason">
            <Select id="ep-reason" name="reason" defaultValue="ended_natural">
              <option value="ended_natural">Ended naturally</option>
              <option value="terminated_provider">Terminated by provider</option>
              <option value="terminated_landlord">Terminated by landlord</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
          <FormField label="Notes" htmlFor="ep-notes" fullWidth>
            <Textarea id="ep-notes" name="notes" rows={2} />
          </FormField>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMode('idle')}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Ending…' : 'End placement'}
            </Button>
          </div>
        </form>
      </div>
    )
  }

  if (mode === 'count') {
    return (
      <div className="rounded-md border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">Update service-user count</h3>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setMode('idle')}
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
              const result = await updateServiceUserCount({
                placementId,
                newCount: fd.get('newCount'),
                effectiveFrom: fd.get('effectiveFrom'),
                reason: fd.get('reason'),
              })
              if (!result.ok) {
                setError(result.error)
                return
              }
              setMode('idle')
              setError(null)
              router.refresh()
            })
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <FormField
            label={`New count (was ${serviceUserCount})`}
            required
            htmlFor="cnt-count"
          >
            <Input id="cnt-count" name="newCount" type="number" min={0} max={50} required />
          </FormField>
          <FormField label="Effective from" required htmlFor="cnt-from">
            <Input id="cnt-from" name="effectiveFrom" type="date" required />
          </FormField>
          <FormField label="Reason" htmlFor="cnt-reason" fullWidth>
            <Input id="cnt-reason" name="reason" placeholder="Why did the count change?" />
          </FormField>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMode('idle')}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Record change'}
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {active && (
        <>
          <Button variant="outline" onClick={() => setMode('count')}>
            Update count
          </Button>
          <Button variant="outline" onClick={() => setMode('end')}>
            End placement
          </Button>
        </>
      )}
    </div>
  )
}
