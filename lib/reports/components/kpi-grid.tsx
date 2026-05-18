// lib/reports/components/kpi-grid.tsx
// Four-up KPI tile block. Matches the on-screen KpiTile visual.

import { Text, View } from '@react-pdf/renderer'
import { styles } from '../styles'

export type Tile = {
  label: string
  display: string
  sub?: string
}

export function KpiGrid({ tiles }: { tiles: Tile[] }) {
  // Render up to 4 tiles per row. Multiple rows if more.
  const rows: Tile[][] = []
  for (let i = 0; i < tiles.length; i += 4) {
    rows.push(tiles.slice(i, i + 4))
  }
  return (
    <View>
      {rows.map((row, idx) => (
        <View key={idx} style={styles.kpiRow}>
          {row.map((t) => (
            <View key={t.label} style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>{t.label}</Text>
              <Text style={styles.kpiValue}>{t.display}</Text>
              {t.sub && <Text style={styles.kpiSub}>{t.sub}</Text>}
            </View>
          ))}
          {/* Pad to 4 columns so partial rows align with full rows. */}
          {row.length < 4 &&
            Array.from({ length: 4 - row.length }).map((_, padIdx) => (
              <View key={`pad-${padIdx}`} style={{ flex: 1 }} />
            ))}
        </View>
      ))}
    </View>
  )
}
