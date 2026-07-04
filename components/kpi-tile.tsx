// components/kpi-tile.tsx
// The single tile shape used on every detail/dashboard page in TenureIQ.

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type KpiTileProps = {
  label: string
  // Rendered as the headline number/string. Pass a formatted string from
  // <MoneyDisplay>, percent helper, etc — this component does not format.
  display: ReactNode
  sub?: ReactNode
  trend?: 'up' | 'down' | 'flat'
  className?: string
}

export function KpiTile({ label, display, sub, trend, className }: KpiTileProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-ring/40', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{display}</p>
      {sub !== undefined && (
        <p
          className={cn(
            'mt-1 text-xs',
            trend === 'up'
              ? 'text-emerald-600 dark:text-emerald-400'
              : trend === 'down'
                ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground',
          )}
        >
          {sub}
        </p>
      )}
    </div>
  )
}
