'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { updateNotificationPreferences } from '../actions'

type Props = {
  initial: {
    notifyCompliance: boolean
    notifyMortgages: boolean
    notifyTenancies: boolean
  }
}

export function PreferencesForm({ initial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState(initial)

  const submit = () => {
    startTransition(async () => {
      setError(null)
      const result = await updateNotificationPreferences(state)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSavedAt(Date.now())
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="space-y-4"
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3 rounded-md border p-4">
        <label className="flex items-start gap-3">
          <Checkbox
            checked={state.notifyCompliance}
            onChange={(e) =>
              setState((s) => ({ ...s, notifyCompliance: e.target.checked }))
            }
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium">Compliance reminders</p>
            <p className="text-xs text-muted-foreground">
              EICR, gas safety, EPC, HMO licence, fire risk assessment, etc.
              Sent on the 90/60/30/14/7/0/-7 day offsets relative to expiry.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3">
          <Checkbox
            checked={state.notifyMortgages}
            onChange={(e) =>
              setState((s) => ({ ...s, notifyMortgages: e.target.checked }))
            }
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium">Mortgage reminders</p>
            <p className="text-xs text-muted-foreground">
              Fixed-rate end approaching, ER charge milestones. (Wired up
              alongside the M4 mortgage engine.)
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3">
          <Checkbox
            checked={state.notifyTenancies}
            onChange={(e) =>
              setState((s) => ({ ...s, notifyTenancies: e.target.checked }))
            }
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium">Tenancy reminders</p>
            <p className="text-xs text-muted-foreground">
              Notice periods, intended end-dates, rent reviews.
            </p>
          </div>
        </label>
      </div>

      <div className="flex items-center justify-end gap-3">
        {savedAt !== null && !pending && (
          <span className="text-xs text-muted-foreground">Saved.</span>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save preferences'}
        </Button>
      </div>
    </form>
  )
}
