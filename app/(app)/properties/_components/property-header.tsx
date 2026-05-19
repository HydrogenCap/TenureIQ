// app/(app)/properties/_components/property-header.tsx
'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { archiveProperty, restoreProperty } from '../actions'

type Props = {
  id: string
  addressLine1: string
  city: string
  postcode: string
  kind: string
  entityName: string
  archived: boolean
  canManage: boolean
  canRestore: boolean
}

export function PropertyHeader({
  id,
  addressLine1,
  city,
  postcode,
  kind,
  entityName,
  archived,
  canManage,
  canRestore,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/properties" className="hover:underline">
            ← Properties
          </Link>
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{addressLine1}</h1>
        <p className="text-sm text-muted-foreground">
          {city} {postcode} • {entityName}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={kind} />
          {archived && <StatusBadge status="ended" />}
        </div>
      </div>
      <div className="flex gap-2">
        {!archived && (
          <Link
            href={`/api/reports/property-pack/${id}`}
            target="_blank"
            className="inline-flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            Property pack PDF
          </Link>
        )}
        {canManage && !archived && (
          <Button variant="outline" onClick={() => router.push(`/properties/${id}/edit`)}>
            Edit
          </Button>
        )}
        {canManage && !archived && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await archiveProperty(id)
                if (result.ok) router.refresh()
              })
            }}
          >
            Archive
          </Button>
        )}
        {canRestore && archived && (
          <Button
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await restoreProperty(id)
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
