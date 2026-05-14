// app/(app)/properties/_components/property-kpis.tsx
import { KpiTile } from '@/components/kpi-tile'
import { MoneyDisplay } from '@/components/money-display'
import { bpsToPercent } from '@/lib/money'
import type { PropertyKpis } from '@/lib/domain/property-kpis'

export function PropertyKpisRow({ kpis }: { kpis: PropertyKpis }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile label="Valuation" display={<MoneyDisplay pence={kpis.valuePence} />} />
      <KpiTile
        label="Equity"
        display={<MoneyDisplay pence={kpis.equityPence} />}
        trend={kpis.equityPence >= 0n ? 'up' : 'down'}
      />
      <KpiTile
        label="LTV"
        display={kpis.ltvBps === null ? '—' : bpsToPercent(kpis.ltvBps)}
        sub={kpis.ltvBps === null ? 'no valuation yet' : undefined}
      />
      <KpiTile
        label="Gross yield"
        display={kpis.grossYieldBps === null ? '—' : bpsToPercent(kpis.grossYieldBps)}
        sub={kpis.grossYieldBps === null ? 'no rent roll' : 'on weekly rent × 52'}
      />
    </div>
  )
}
