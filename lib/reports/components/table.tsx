// lib/reports/components/table.tsx
// Typed table primitives. Each row uses wrap={false} so a row never
// gets split across pages. Header row repeats (fixed) so multi-page
// tables stay readable.

import { Text, View } from '@react-pdf/renderer'
import { styles } from '../styles'

export type Align = 'left' | 'right' | 'center'

export type Column<Row> = {
  header: string
  // flex sizing — sums determine the column proportions.
  flex: number
  align?: Align
  // Render a cell. Returning a string is shorthand; React.ReactNode for
  // complex cells (status pills etc.) is fine via the JSX form.
  render: (row: Row) => string | React.ReactNode
}

export function Table<Row>({
  columns,
  rows,
}: {
  columns: Column<Row>[]
  rows: Row[]
}) {
  return (
    <View style={styles.table}>
      <View fixed style={[styles.tr, styles.trHead]}>
        {columns.map((c) => (
          <Text
            key={c.header}
            style={[
              styles.td,
              styles.tdHead,
              { flex: c.flex, textAlign: c.align ?? 'left' },
            ]}
          >
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} wrap={false} style={styles.tr}>
          {columns.map((c) => {
            const value = c.render(row)
            const style = [
              styles.td,
              { flex: c.flex, textAlign: c.align ?? 'left' },
            ]
            return typeof value === 'string' ? (
              <Text key={c.header} style={style}>
                {value}
              </Text>
            ) : (
              <View key={c.header} style={style}>
                {value}
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}
