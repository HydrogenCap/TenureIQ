import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'

export default function NotFound() {
  return (
    <EmptyState
      title="Tenancy not found"
      description="It may have been archived, or you may not have access to it."
      action={
        <Link href="/tenancies" className="text-sm font-medium text-primary hover:underline">
          ← Back to tenancies
        </Link>
      }
    />
  )
}
