// app/(app)/arrears/loading.tsx — skeleton mirroring the KPI row + table.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-12 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  )
}
