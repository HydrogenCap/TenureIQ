'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { revokeInvitation } from '../actions'
import { Button } from '@/components/ui/button'

export function RevokeButton({ invitationId }: { invitationId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onRevoke = () => {
    if (!window.confirm('Revoke this invitation?')) return
    setError(null)
    startTransition(async () => {
      const result = await revokeInvitation({ invitationId })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onRevoke}>
        {pending ? 'Revoking…' : 'Revoke'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
