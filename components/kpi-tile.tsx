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
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{display}</p>
      {sub !== undefined && (
        <p
          className={cn(
            'mt-1 text-xs',
            trend === 'up'
              ? 'text-green-600'
              : trend === 'down'
                ? 'text-red-600'
                : 'text-muted-foreground',
          )}
        >
          {sub}
        </p>
      )}
    </div>
  )
}
