export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-32 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}
