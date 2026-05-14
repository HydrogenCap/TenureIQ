// app/(app)/entities/[id]/not-found.tsx
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'

export default function EntityNotFound() {
  return (
    <EmptyState
      title="Entity not found"
      description="It may have been archived, or you may not have access to it."
      action={
        <Link href="/entities" className="text-sm font-medium text-primary hover:underline">
          ← Back to entities
        </Link>
      }
    />
  )
}
