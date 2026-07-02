'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { ROLES, ROLE_LABELS, type InvitableRole } from '@/lib/schemas/invitation'
import { removeMember, updateMemberRole } from '../actions'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

function isInvitableRole(value: string): value is InvitableRole {
  return (ROLES as readonly string[]).includes(value)
}

export function MemberRowActions({
  memberId,
  role,
  isSelf,
}: {
  memberId: string
  role: string
  isSelf: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (role === 'owner') {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  const onRoleChange = (value: string) => {
    if (!isInvitableRole(value) || value === role) return
    setError(null)
    startTransition(async () => {
      const result = await updateMemberRole({ memberId, role: value })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const onRemove = () => {
    if (!window.confirm('Remove this member from the organisation?')) return
    setError(null)
    startTransition(async () => {
      const result = await removeMember({ memberId })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-2">
        <Select
          aria-label="Change role"
          className="h-8 w-32"
          defaultValue={role}
          disabled={pending}
          onChange={(e) => onRoleChange(e.target.value)}
        >
          {!isInvitableRole(role) && <option value={role}>{role}</option>}
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || isSelf}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
