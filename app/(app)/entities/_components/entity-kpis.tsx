// app/(app)/entities/_components/entity-kpis.tsx
import { KpiTile } from '@/components/kpi-tile'
import { MoneyDisplay } from '@/components/money-display'
import { bpsToPercent } from '@/lib/money'

export function EntityKpis({
  propertyCount,
  portfolioValuePence,
  totalDebtPence,
  weightedLtvBps,
}: {
  propertyCount: number
  portfolioValuePence: bigint
  totalDebtPence: bigint
  weightedLtvBps: number | null
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile label="Properties held" display={propertyCount} />
      <KpiTile
        label="Portfolio value"
        display={<MoneyDisplay pence={portfolioValuePence} />}
      />
      <KpiTile label="Mortgage debt" display={<MoneyDisplay pence={totalDebtPence} />} />
      <KpiTile
        label="Weighted LTV"
        display={weightedLtvBps === null ? '—' : bpsToPercent(weightedLtvBps)}
      />
    </div>
  )
}
