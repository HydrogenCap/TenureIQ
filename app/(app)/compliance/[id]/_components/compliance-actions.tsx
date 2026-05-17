'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormField } from '@/components/form-field'
import { archiveComplianceItem, markExempt } from '../../actions'

type Props = {
  itemId: string
  canManage: boolean
  status: string
}

type Mode = 'idle' | 'exempt'

export function ComplianceActions({ itemId, canManage, status }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('idle')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!canManage) return null

  if (mode === 'exempt') {
    return (
      <div className="rounded-md border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">Mark as exempt</h3>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => {
              setMode('idle')
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
              const result = await markExempt({
                itemId,
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
          className="space-y-3"
        >
          <FormField
            label="Reason"
            hint="Required — kept on the item and audit log. E.g. MEES exemption registered, listed-building exception."
            required
            htmlFor="ex-reason"
          >
            <Textarea id="ex-reason" name="reason" rows={3} required />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMode('idle')}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Mark exempt'}
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'exempt' && (
        <Button variant="outline" onClick={() => setMode('exempt')}>
          Mark exempt
        </Button>
      )}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const r = await archiveComplianceItem(itemId)
            if (r.ok) {
              router.push('/compliance')
              router.refresh()
            } else {
              setError(r.error)
            }
          })
        }}
      >
        Archive
      </Button>
      {error && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
