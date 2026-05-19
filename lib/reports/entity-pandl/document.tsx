// lib/reports/entity-pandl/document.tsx

import { Document, Page, Text, View } from '@react-pdf/renderer'
import { styles, COLOR } from '../styles'
import { ReportHeader, ReportFooter } from '../components/page-shell'
import { KpiGrid } from '../components/kpi-grid'
import { Table, type Column } from '../components/table'
import { formatGbp, bpsToPercent } from '@/lib/money'
import type { CategoryCode } from '@/lib/domain/transactions'
import type { EntityPandLData, EntityPandLMonth } from './types'

type RowKind = 'income' | 'cost' | 'net'

type Row = {
  kind: RowKind
  label: string
  // One bigint per month, plus the YTD total at the end.
  values: bigint[]
}

function buildRows(data: EntityPandLData): Row[] {
  const months = data.months
  const ytdByMonth = (cat: string): bigint[] => {
    const monthly = months.map(
      (m) => m.byCategory[cat as CategoryCode] ?? 0n,
    )
    const ytd = monthly.reduce((s, v) => s + v, 0n)
    return [...monthly, ytd]
  }

  const rows: Row[] = []
  for (const c of data.creditCategories) {
    rows.push({ kind: 'income', label: c.replace(/_/g, ' '), values: ytdByMonth(c) })
  }
  for (const c of data.debitCategories) {
    rows.push({ kind: 'cost', label: c.replace(/_/g, ' '), values: ytdByMonth(c) })
  }
  const netMonthly = months.map((m) => m.netPence)
  const netYtd = netMonthly.reduce((s, v) => s + v, 0n)
  rows.push({ kind: 'net', label: 'Net', values: [...netMonthly, netYtd] })
  return rows
}

export function EntityPandLDocument({ data }: { data: EntityPandLData }) {
  const rows = buildRows(data)

  // Each month column is one cell, plus the YTD column at the end.
  const columns: Column<Row>[] = [
    {
      header: 'Category',
      flex: 2.4,
      render: (r) => (
        <Text
          style={{
            color: r.kind === 'net' ? COLOR.primary : COLOR.text,
            fontWeight: r.kind === 'net' ? 'bold' : 'normal',
          }}
        >
          {r.label}
        </Text>
      ),
    },
    ...data.months.map((m: EntityPandLMonth, i: number) => ({
      header: m.monthLabel,
      flex: 0.9,
      align: 'right' as const,
      render: (r: Row) => {
        const v = r.values[i] ?? 0n
        if (v === 0n) return '—'
        return formatGbp(v)
      },
    })),
    {
      header: 'YTD',
      flex: 1.2,
      align: 'right' as const,
      render: (r: Row) => {
        const v = r.values[r.values.length - 1] ?? 0n
        const formatted = formatGbp(v)
        return (
          <Text
            style={{ fontWeight: r.kind === 'net' ? 'bold' : 'normal' }}
          >
            {formatted}
          </Text>
        )
      },
    },
  ]

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <ReportHeader
          orgName={data.organisationName}
          reportTitle={`P&L statement — ${data.entityName}`}
          asOf={data.asOf}
        />

        <View>
          <Text style={styles.h1}>{data.entityName} — P&amp;L statement</Text>
          <Text style={styles.small}>
            Year to date {data.year} ·{' '}
            {data.entityKind === 'ltd' || data.entityKind === 'spv'
              ? 'Company'
              : 'Individual / LLP'}
          </Text>

          <KpiGrid
            tiles={[
              {
                label: 'YTD net',
                display: formatGbp(data.ytdNetPence),
              },
              {
                label: 'Gross rent',
                display: formatGbp(data.ytdGrossRentPence),
              },
              {
                label: 'Mortgage interest',
                display: formatGbp(data.ytdMortgageInterestPence),
              },
              {
                label: 'Other costs',
                display: formatGbp(data.ytdOtherCostsPence),
              },
            ]}
          />

          <Text style={styles.h2}>Monthly breakdown</Text>
          {data.months.length === 0 ? (
            <Text style={styles.small}>
              No transactions recorded yet this year.
            </Text>
          ) : (
            <Table columns={columns} rows={rows} />
          )}

          {data.taxEstimate && (
            <View style={styles.alert} wrap={false}>
              <Text style={{ fontWeight: 'bold' }}>
                {data.taxEstimate.headline}
              </Text>
              <Text style={{ marginTop: 4 }}>
                Estimated YTD tax — {formatGbp(data.taxEstimate.netTaxPence)}
              </Text>
              {data.taxEstimate.effectiveRateOnRentBps !== null && (
                <Text>
                  Effective tax fraction of gross income —{' '}
                  {bpsToPercent(data.taxEstimate.effectiveRateOnRentBps)}
                </Text>
              )}
              {data.taxEstimate.section24CostPence !== null &&
                data.taxEstimate.section24CostPence > 0n && (
                  <Text style={{ marginTop: 4 }}>
                    Section 24 cost (extra tax vs pre-2017 deduction) —{' '}
                    {formatGbp(data.taxEstimate.section24CostPence)}
                  </Text>
                )}
              <Text style={{ marginTop: 4, color: COLOR.muted }}>
                {data.taxEstimate.rateAssumption}
              </Text>
            </View>
          )}

          <Text style={[styles.small, { marginTop: 12, color: COLOR.muted }]}>
            Quick estimate. Full year-end tax computation belongs on the
            accountant&apos;s annual report.
          </Text>
        </View>

        <ReportFooter />
      </Page>
    </Document>
  )
}
