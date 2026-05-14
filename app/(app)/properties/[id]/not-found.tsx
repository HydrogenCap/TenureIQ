// app/(app)/properties/[id]/not-found.tsx
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'

export default function PropertyNotFound() {
  return (
    <EmptyState
      title="Property not found"
      description="It may have been archived, or you may not have access to it."
      action={
        <Link href="/properties" className="text-sm font-medium text-primary hover:underline">
          ← Back to properties
        </Link>
      }
    />
  )
}
