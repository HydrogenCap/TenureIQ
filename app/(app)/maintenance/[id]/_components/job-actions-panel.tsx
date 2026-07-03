'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormField } from '@/components/form-field'
import {
  triageJob,
  assignContractor,
  recordQuote,
  scheduleJob,
  completeJob,
  addJobNote,
  cancelJob,
} from '../../actions'
import { JOB_PRIORITIES, JOB_KINDS } from '@/lib/schemas/maintenance'

type ContractorOpt = { id: string; name: string }

type Props = {
  jobId: string
  status: string
  canManage: boolean
  contractors: ContractorOpt[]
}

type Mode = 'idle' | 'triage' | 'assign' | 'quote' | 'schedule' | 'complete' | 'note' | 'cancel'

export function JobActionsPanel({ jobId, status, canManage, contractors }: Props) {
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

  if (mode === 'triage') {
    return (
      <Panel title="Triage job" onCancel={() => setMode('idle')}>
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
              const r = await triageJob({
                jobId,
                priority: fd.get('priority') || undefined,
                kind: fd.get('kind') || undefined,
                notes: fd.get('notes'),
              })
              if (!r.ok) setError(r.error)
              else finish()
            })
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <FormField label="Priority (optional)" htmlFor="t-prio">
            <Select id="t-prio" name="priority">
              <option value="">— No change —</option>
              {JOB_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </FormField>
          <FormField label="Kind (optional)" htmlFor="t-kind">
            <Select id="t-kind" name="kind">
              <option value="">— No change —</option>
              {JOB_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
            </Select>
          </FormField>
          <FormField label="Notes" htmlFor="t-notes" fullWidth>
            <Textarea id="t-notes" name="notes" rows={2} />
          </FormField>
          <SubmitRow pending={pending} onCancel={() => setMode('idle')} label="Triage" />
        </form>
      </Panel>
    )
  }

  if (mode === 'assign') {
    return (
      <Panel title="Assign contractor" onCancel={() => setMode('idle')}>
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
              const r = await assignContractor({
                jobId,
                contractorId: fd.get('contractorId'),
              })
              if (!r.ok) setError(r.error)
              else finish()
            })
          }}
          className="space-y-3"
        >
          <FormField label="Contractor" required htmlFor="a-c">
            <Select id="a-c" name="contractorId" required>
              <option value="">— Pick a contractor —</option>
              {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <SubmitRow pending={pending} onCancel={() => setMode('idle')} label="Assign" />
        </form>
      </Panel>
    )
  }

  if (mode === 'quote') {
    return (
      <Panel title="Record quote" onCancel={() => setMode('idle')}>
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
              const r = await recordQuote({
                jobId,
                contractorId: fd.get('contractorId'),
                amountPence: fd.get('amountPence'),
                validityUntil: fd.get('validityUntil'),
                notes: fd.get('notes'),
              })
              if (!r.ok) setError(r.error)
              else finish()
            })
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <FormField label="Contractor" required htmlFor="q-c">
            <Select id="q-c" name="contractorId" required>
              <option value="">— Pick a contractor —</option>
              {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Amount (£)" required htmlFor="q-amt">
            <Input id="q-amt" name="amountPence" inputMode="decimal" required />
          </FormField>
          <FormField label="Valid until" htmlFor="q-vu">
            <Input id="q-vu" name="validityUntil" type="date" />
          </FormField>
          <FormField label="Notes" htmlFor="q-notes" fullWidth>
            <Textarea id="q-notes" name="notes" rows={2} />
          </FormField>
          <SubmitRow pending={pending} onCancel={() => setMode('idle')} label="Record quote" />
        </form>
      </Panel>
    )
  }

  if (mode === 'schedule') {
    return (
      <Panel title="Schedule" onCancel={() => setMode('idle')}>
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
              const r = await scheduleJob({
                jobId,
                targetDate: fd.get('targetDate'),
              })
              if (!r.ok) setError(r.error)
              else finish()
            })
          }}
          className="space-y-3"
        >
          <FormField label="Target completion date" required htmlFor="s-td">
            <Input id="s-td" name="targetDate" type="date" required />
          </FormField>
          <SubmitRow pending={pending} onCancel={() => setMode('idle')} label="Schedule" />
        </form>
      </Panel>
    )
  }

  if (mode === 'complete') {
    return (
      <Panel title="Complete job" onCancel={() => setMode('idle')}>
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
              const r = await completeJob({
                jobId,
                completedAt: fd.get('completedAt'),
                finalCostPence: fd.get('finalCostPence'),
              })
              if (!r.ok) setError(r.error)
              else finish()
            })
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <FormField label="Completed on" required htmlFor="c-date">
            <Input id="c-date" name="completedAt" type="date" required />
          </FormField>
          <FormField label="Final cost (£)" required htmlFor="c-cost">
            <Input id="c-cost" name="finalCostPence" inputMode="decimal" required />
          </FormField>
          <SubmitRow pending={pending} onCancel={() => setMode('idle')} label="Complete" />
        </form>
      </Panel>
    )
  }

  if (mode === 'note') {
    return (
      <Panel title="Add note" onCancel={() => setMode('idle')}>
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
              const r = await addJobNote({ jobId, body: fd.get('body') })
              if (!r.ok) setError(r.error)
              else finish()
            })
          }}
          className="space-y-3"
        >
          <FormField label="Note" required htmlFor="n-body">
            <Textarea id="n-body" name="body" rows={3} required />
          </FormField>
          <SubmitRow pending={pending} onCancel={() => setMode('idle')} label="Add note" />
        </form>
      </Panel>
    )
  }

  if (mode === 'cancel') {
    return (
      <Panel title="Cancel job" onCancel={() => setMode('idle')}>
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
              const r = await cancelJob({ jobId, reason: fd.get('reason') })
              if (!r.ok) setError(r.error)
              else finish()
            })
          }}
          className="space-y-3"
        >
          <FormField label="Reason" required htmlFor="x-reason">
            <Input id="x-reason" name="reason" required />
          </FormField>
          <SubmitRow
            pending={pending}
            onCancel={() => setMode('idle')}
            label="Cancel job"
            variant="destructive"
          />
        </form>
      </Panel>
    )
  }

  const closed = status === 'completed' || status === 'cancelled'

  return (
    <div className="flex flex-wrap gap-2">
      {!closed && status === 'reported' && (
        <Button variant="outline" onClick={() => setMode('triage')}>
          Triage
        </Button>
      )}
      {!closed && contractors.length > 0 && (
        <Button variant="outline" onClick={() => setMode('assign')}>
          Assign contractor
        </Button>
      )}
      {!closed && (
        <Button variant="outline" onClick={() => setMode('quote')}>
          Record quote
        </Button>
      )}
      {!closed && (
        <Button variant="outline" onClick={() => setMode('schedule')}>
          Schedule
        </Button>
      )}
      {!closed && (
        <Button variant="outline" onClick={() => setMode('complete')}>
          Complete
        </Button>
      )}
      <Button variant="outline" onClick={() => setMode('note')}>
        Add note
      </Button>
      {!closed && (
        <Button variant="outline" onClick={() => setMode('cancel')}>
          Cancel
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

function SubmitRow({
  pending,
  onCancel,
  label,
  variant = 'default',
}: {
  pending: boolean
  onCancel: () => void
  label: string
  variant?: 'default' | 'destructive'
}) {
  return (
    <div className="sm:col-span-2 flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? 'Saving…' : label}
      </Button>
    </div>
  )
}
