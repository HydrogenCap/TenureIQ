// app/(app)/not-found.tsx — section-wide not-found for the authenticated app.
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'

export default function AppNotFound() {
  return (
    <EmptyState
      title="This page could not be found"
      description="It may have been moved, or you may not have access to it."
      action={
        <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
          ← Back to dashboard
        </Link>
      }
    />
  )
}
