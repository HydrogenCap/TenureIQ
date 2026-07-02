// app/(app)/maintenance/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-12 animate-pulse rounded bg-muted" />
      <div className="h-10 animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  )
}
