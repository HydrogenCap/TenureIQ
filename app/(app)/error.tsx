// app/(app)/error.tsx — error boundary for the authenticated app section.
'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong loading this page</CardTitle>
          <CardDescription>
            An unexpected error occurred. You can try again, or head back to the dashboard.
            {error.digest ? ` Reference: ${error.digest}` : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Button type="button" variant="outline" size="sm" onClick={() => reset()}>
            Try again
          </Button>
          <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
