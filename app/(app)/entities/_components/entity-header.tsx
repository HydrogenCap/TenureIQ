// app/(app)/entities/_components/entity-header.tsx
'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { archiveEntity, restoreEntity } from '../actions'

type Props = {
  id: string
  name: string
  kind: string
  archived: boolean
  canManage: boolean
  canRestore: boolean
}

export function EntityHeader({ id, name, kind, archived, canManage, canRestore }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/entities" className="hover:underline">
            ← Entities
          </Link>
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{name}</h1>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={kind} />
          {archived && <StatusBadge status="ended" />}
        </div>
      </div>
      <div className="flex gap-2">
        {canManage && !archived && (
          <Button variant="outline" onClick={() => router.push(`/entities/${id}/edit`)}>
            Edit
          </Button>
        )}
        {canManage && !archived && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await archiveEntity(id)
                if (result.ok) router.refresh()
              })
            }}
          >
            Archive
          </Button>
        )}
        {canRestore && archived && (
          <Button
            variant="default"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await restoreEntity(id)
                if (result.ok) router.refresh()
              })
            }}
          >
            Restore
          </Button>
        )}
      </div>
    </div>
  )
}
