// lib/reports/portfolio-summary/document.tsx

import { Document, Page, Text, View } from '@react-pdf/renderer'
import { styles, COLOR } from '../styles'
import { ReportHeader, ReportFooter } from '../components/page-shell'
import { KpiGrid } from '../components/kpi-grid'
import { Table, type Column } from '../components/table'
import { formatGbp, bpsToPercent } from '@/lib/money'
import type { PortfolioRow, PortfolioSummaryData } from './types'

export function PortfolioSummaryDocument({ data }: { data: PortfolioSummaryData }) {
  const columns: Column<PortfolioRow>[] = [
    {
      header: 'Address',
      flex: 3,
      render: (r) => `${r.addressLine1}, ${r.postcode}`,
    },
    { header: 'Entity', flex: 2, render: (r) => r.entityName },
    { header: 'Kind', flex: 1, render: (r) => r.kind.replace(/_/g, ' ') },
    {
      header: 'EPC',
      flex: 0.6,
      align: 'center',
      render: (r) =>
        r.letBlocked ? (
          <Text style={{ color: COLOR.destructive, fontWeight: 'bold' }}>
            {r.epcRating ?? '—'}
          </Text>
        ) : (
          r.epcRating ?? '—'
        ),
    },
    {
      header: 'Value',
      flex: 1.2,
      align: 'right',
      render: (r) => formatGbp(r.valuePence),
    },
    {
      header: 'Debt',
      flex: 1.2,
      align: 'right',
      render: (r) => (r.debtPence === 0n ? '—' : formatGbp(r.debtPence)),
    },
    {
      header: 'LTV',
      flex: 0.8,
      align: 'right',
      render: (r) => (r.ltvBps === null ? '—' : bpsToPercent(r.ltvBps)),
    },
    {
      header: 'Yield',
      flex: 0.8,
      align: 'right',
      render: (r) =>
        r.grossYieldBps === null ? '—' : bpsToPercent(r.grossYieldBps),
    },
  ]

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader
          orgName={data.organisationName}
          reportTitle="Portfolio summary"
          asOf={data.asOf}
        />

        <View>
          <Text style={styles.h1}>Portfolio summary</Text>
          <Text style={styles.small}>
            {data.totals.propertyCount} {data.totals.propertyCount === 1 ? 'property' : 'properties'}
          </Text>

          <KpiGrid
            tiles={[
              { label: 'Properties', display: String(data.totals.propertyCount) },
              { label: 'Portfolio value', display: formatGbp(data.totals.valuePence) },
              {
                label: 'Mortgage debt',
                display: formatGbp(data.totals.debtPence),
                sub: `Equity ${formatGbp(data.totals.equityPence)}`,
              },
              {
                label: 'Weighted LTV',
                display:
                  data.totals.weightedLtvBps === null
                    ? '—'
                    : bpsToPercent(data.totals.weightedLtvBps),
              },
            ]}
          />

          {data.letBlockedCount > 0 && (
            <View style={styles.alert}>
              <Text style={{ fontWeight: 'bold' }}>
                {data.letBlockedCount} {data.letBlockedCount === 1 ? 'property' : 'properties'} let-blocked
              </Text>
              <Text>
                EPC rating F or G with no exemption recorded. Cannot legally be let.
                See the Compliance report for detail.
              </Text>
            </View>
          )}

          <Text style={styles.h2}>Properties</Text>
          <Table columns={columns} rows={data.rows} />
        </View>

        <ReportFooter />
      </Page>
    </Document>
  )
}
