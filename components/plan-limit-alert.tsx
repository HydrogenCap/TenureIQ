// components/plan-limit-alert.tsx
// Rendered when a server action refuses because the organisation hit a
// plan quota (the action returns fieldErrors._plan alongside the human
// message). Turns a dead-end error into an upgrade path.

import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'

export function PlanLimitAlert({ message }: { message: string }) {
  return (
    <Alert>
      <AlertDescription>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{message}</span>
          <Link
            href="/settings/billing"
            className={buttonVariants({ size: 'sm' })}
          >
            View plans
          </Link>
        </div>
      </AlertDescription>
    </Alert>
  )
}
