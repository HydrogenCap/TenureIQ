// app/(app)/investors/[id]/_components/invite-portal-button.tsx
// "Invite to portal" affordance on the investor detail page. Sends a
// viewer-role invitation to the investor's contact email via the same
// invitation flow as team invites. Inline success/error keeps the user
// on the page — there is nothing to navigate to after inviting.
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { inviteInvestorToPortal } from '../../actions'

type Props = {
  investorId: string
  // Shown in the success message so the admin can spot a stale address
  // immediately ("wait, that went to their old email").
  email: string
}

type Feedback = { kind: 'success' | 'error'; text: string }

export function InvitePortalButton({ investorId, email }: Props) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setFeedback(null)
          startTransition(async () => {
            const result = await inviteInvestorToPortal({ investorId })
            if (result.ok) {
              setFeedback({
                kind: 'success',
                text: `Portal invitation sent to ${email}. They get read-only (viewer) access once they accept.`,
              })
            } else {
              // Surfaces duplicate-member / pending-invite messages from
              // the shared invitation flow verbatim.
              setFeedback({ kind: 'error', text: result.error })
            }
          })
        }}
      >
        {pending ? 'Inviting…' : 'Invite to portal'}
      </Button>
      {feedback && (
        <p
          role="status"
          className={
            feedback.kind === 'success'
              ? 'text-xs text-green-600'
              : 'text-xs text-destructive'
          }
        >
          {feedback.text}
        </p>
      )}
    </div>
  )
}
