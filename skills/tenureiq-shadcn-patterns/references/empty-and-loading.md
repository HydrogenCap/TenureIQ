# Empty States, Loading Skeletons, Error Boundaries

The three states every page needs beyond the happy path. Each has a reusable primitive.

## EmptyState component

```tsx
// components/empty-state.tsx
import { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-3 mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
```

## Empty-state messages — TenureIQ vocabulary

The copy matters. Generic "No data" is lazy. Each empty state speaks to the workflow:

| Resource | Title | Description |
|---|---|---|
| Properties | "No properties yet" | "Add your first property to start tracking your portfolio." |
| Entities | "No entities yet" | "Create an entity (Ltd, LLP, or individual) to hold your properties." |
| Tenancies | "No tenancies for this property" | "Add an AST tenancy or an AASC placement to start tracking occupancy." |
| Mortgages | "No mortgages recorded" | "Add a mortgage to track LTV, ICR, and refinance windows." |
| Compliance | "All compliance items up to date" | "Gas, EICR, EPC and HMO certificates are all current." |
| Compliance (empty) | "No compliance items yet" | "Upload your gas safety certificate, EICR, or EPC to start tracking expiry dates." |
| AASC placements | "No placements yet" | "Add a Clearsprings or Serco placement once the contract is in place." |
| Maintenance | "No active maintenance jobs" | "Report a maintenance issue or upload contractor invoices to build history." |
| Documents | "No documents uploaded" | "Drop a PDF or photo to start your document library. OCR extracts compliance dates automatically." |
| Transactions | "No transactions yet" | "Import a bank statement CSV or connect via Open Banking to start the P&L." |

The compliance "all good" variant is **important** — never show a literal empty-table view for compliance, because it implies "you haven't done compliance" rather than "you're compliant".

## Skeleton component

shadcn ships `<Skeleton>` already. Compose for the specific layout:

```tsx
// app/(app)/properties/[id]/loading.tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function PropertyDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Skeleton className="h-10 w-full" />

      {/* Tab content */}
      <div className="rounded-md border bg-card p-6 space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}
```

**Rule**: the skeleton should approximate the rendered layout. Generic full-screen spinners are lazy. Users tolerate slow loads if they see the shape forming.

## Error boundary

```tsx
// app/(app)/properties/error.tsx
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

export default function PropertiesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Forward to Sentry/observability if configured
    console.error('Properties error:', error)
  }, [error])

  return (
    <div className="mx-auto max-w-md py-12">
      <Alert variant="destructive">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>We couldn't load your properties. The error has been logged.</p>
          {error.digest && (
            <p className="font-mono text-xs">Reference: {error.digest}</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={reset}>Try again</Button>
            <Button size="sm" variant="outline" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  )
}
```

The error boundary should:
1. Show a friendly message — never the raw exception
2. Include the `error.digest` (Next.js correlation ID) so users can quote it to support
3. Offer a retry that doesn't full-page reload
4. Log to observability (Sentry) automatically

## Inline form errors vs alerts vs toasts

| Pattern | When |
|---|---|
| Field-level error (red text under input) | Validation failure on a specific field |
| Inline `<Alert>` at top of form | Action-level failure ("This slug is taken") |
| Toast (sonner) | Success after async action ("Property created") |
| `<AlertDialog>` (confirm) | Destructive action confirmation |
| Page-level error boundary | Unrecoverable error during render |

Negative-by-toast is a bug. Errors stay close to where the user can act on them.

## Anti-patterns

1. `<div>Loading...</div>` instead of a layout-matching skeleton.
2. `<div>No data</div>` instead of a vocabulary-aware empty state.
3. Catching all errors and showing one generic "Something went wrong" — segment by route.
4. Throwing from server actions instead of returning `ActionResult` (no field-level UX possible).
5. Skeleton that's a single grey rectangle the size of the page.
