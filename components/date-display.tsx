// components/date-display.tsx
// One home for "render a Date/ISO string in UK locale". Don't inline-format.

import { format, formatDistanceToNowStrict } from 'date-fns'

type DateLike = Date | string | null | undefined

export function DateDisplay({
  date,
  formatStr = 'd MMM yyyy',
  distance = false,
  fallback = '—',
  className,
}: {
  date: DateLike
  formatStr?: string
  distance?: boolean
  fallback?: string
  className?: string
}) {
  if (!date) return <span className={className}>{fallback}</span>
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return <span className={className}>{fallback}</span>

  if (distance) {
    const inPast = d.getTime() < Date.now()
    return (
      <span className={className}>
        {inPast
          ? `${formatDistanceToNowStrict(d)} ago`
          : `in ${formatDistanceToNowStrict(d)}`}
      </span>
    )
  }
  return <span className={className}>{format(d, formatStr)}</span>
}
