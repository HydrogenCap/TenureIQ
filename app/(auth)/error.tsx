// app/(auth)/error.tsx — error boundary for the auth section.
'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthError({
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
            An unexpected error occurred. You can try again, or return to the login page.
            {error.digest ? ` Reference: ${error.digest}` : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Button type="button" variant="outline" size="sm" onClick={() => reset()}>
            Try again
          </Button>
          <Link href="/login" className="text-sm font-medium text-primary hover:underline">
            Back to login
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
