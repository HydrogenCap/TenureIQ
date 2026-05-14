// components/money-display.tsx
// One home for "render bigint pence as GBP" — never inline-format anywhere else.

import { formatGbp, formatGbpPrecise } from '@/lib/money'

export function MoneyDisplay({
  pence,
  precise = false,
  fallback = '—',
  className,
}: {
  pence: bigint | null | undefined
  precise?: boolean
  fallback?: string
  className?: string
}) {
  if (pence === null || pence === undefined) {
    return <span className={className}>{fallback}</span>
  }
  return (
    <span className={className}>{precise ? formatGbpPrecise(pence) : formatGbp(pence)}</span>
  )
}
