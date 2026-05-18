// lib/reports/mortgage-book/document.tsx

import { Document, Page, Text, View } from '@react-pdf/renderer'
import { styles, COLOR } from '../styles'
import { ReportHeader, ReportFooter } from '../components/page-shell'
import { KpiGrid } from '../components/kpi-grid'
import { Table, type Column } from '../components/table'
import { formatGbp, bpsToPercent } from '@/lib/money'
import { format } from 'date-fns'
import type { MortgageBookRow, MortgageBookData } from './types'

export function MortgageBookDocument({ data }: { data: MortgageBookData }) {
  const columns: Column<MortgageBookRow>[] = [
    {
      header: 'Property',
      flex: 2.6,
      render: (r) => `${r.propertyAddressLine1}, ${r.propertyPostcode}`,
    },
    {
      header: 'Lender / product',
      flex: 1.8,
      render: (r) => (
        <View>
          <Text>{r.lender}</Text>
          <Text style={{ color: COLOR.muted, fontSize: 7 }}>
            {r.product}
            {r.isInterestOnly ? ' · IO' : ''}
          </Text>
        </View>
      ),
    },
    {
      header: 'Rate',
      flex: 0.8,
      align: 'right',
      render: (r) => bpsToPercent(r.interestRateBps),
    },
    {
      header: 'Balance',
      flex: 1.2,
      align: 'right',
      render: (r) => formatGbp(r.currentBalancePence),
    },
    {
      header: 'LTV',
      flex: 0.8,
      align: 'right',
      render: (r) => (r.ltvBps === null ? '—' : bpsToPercent(r.ltvBps)),
    },
    {
      header: 'Fixed end',
      flex: 1.4,
      render: (r) =>
        r.fixedEndDate ? (
          <View>
            <Text>{format(new Date(r.fixedEndDate), 'd MMM yyyy')}</Text>
            <Text
              style={{
                color:
                  r.daysToFixedEnd !== null && r.daysToFixedEnd <= 180
                    ? COLOR.warning
                    : COLOR.muted,
                fontSize: 7,
              }}
            >
              {r.daysToFixedEnd === null
                ? ''
                : r.daysToFixedEnd < 0
                  ? `${-r.daysToFixedEnd}d ago`
                  : `in ${r.daysToFixedEnd}d`}
            </Text>
          </View>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader
          orgName={data.organisationName}
          reportTitle="Mortgage book"
          asOf={data.asOf}
        />
        <Text style={styles.h1}>Mortgage book</Text>
        <Text style={styles.small}>
          {data.totals.mortgageCount}{' '}
          {data.totals.mortgageCount === 1 ? 'mortgage' : 'mortgages'}
          {data.refinanceWindowCount > 0
            ? ` · ${data.refinanceWindowCount} fixed-rate end within 6 months`
            : ''}
        </Text>

        <KpiGrid
          tiles={[
            {
              label: 'Total balance',
              display: formatGbp(data.totals.currentBalancePence),
            },
            {
              label: 'Weighted rate',
              display:
                data.totals.weightedAverageRateBps === null
                  ? '—'
                  : bpsToPercent(data.totals.weightedAverageRateBps),
            },
            {
              label: 'Monthly interest',
              display: formatGbp(data.totals.monthlyInterestPence),
            },
            {
              label: 'Annualised interest',
              display: formatGbp(data.totals.monthlyInterestPence * 12n),
            },
          ]}
        />

        <Text style={styles.h2}>Mortgages</Text>
        <Table columns={columns} rows={data.rows} />

        <Text style={styles.h2}>Sensitivity (parallel rate shock)</Text>
        <View
          style={[
            styles.alert,
            { borderLeftColor: COLOR.accent, backgroundColor: COLOR.bgSubtle },
          ]}
        >
          <Text>
            Stressed monthly interest at the parallel rate shock applied
            uniformly to every mortgage:
          </Text>
          <View style={{ marginTop: 4 }}>
            <Text>
              · Current: {formatGbp(data.totals.monthlyInterestPence)} / month (
              {formatGbp(data.totals.monthlyInterestPence * 12n)} / year)
            </Text>
            <Text>
              · +1.00%:{' '}
              {formatGbp(data.totals.stressed1ppMonthlyInterestPence)} / month (
              {formatGbp(data.totals.stressed1ppMonthlyInterestPence * 12n)} /
              year)
            </Text>
            <Text>
              · +2.00%:{' '}
              {formatGbp(data.totals.stressed2ppMonthlyInterestPence)} / month (
              {formatGbp(data.totals.stressed2ppMonthlyInterestPence * 12n)} /
              year)
            </Text>
          </View>
          <Text style={styles.small}>
            Interest-only mortgages: interest is the full payment. Repayment
            mortgages would also see a payment increase, but the capital
            portion is unchanged — this report stresses interest only.
          </Text>
        </View>

        <ReportFooter />
      </Page>
    </Document>
  )
}
