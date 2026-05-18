// lib/reports/investor-capital-statement/document.tsx

import { Document, Page, Text, View } from '@react-pdf/renderer'
import { styles, COLOR } from '../styles'
import { ReportHeader, ReportFooter } from '../components/page-shell'
import { Table, type Column } from '../components/table'
import { formatGbp, bpsToPercent } from '@/lib/money'
import { format } from 'date-fns'
import type { InvestorStatementData, InvestorStatementTx } from './types'

const KIND_LABEL: Record<string, string> = {
  contribution: 'Contribution',
  distribution: 'Distribution',
  interest_accrual: 'Interest accrual',
  // 'fee' falls through to default — the unmapped path produces 'fee'
  // verbatim which is identical to what we'd hand-write.
  redemption: 'Redemption',
  adjustment: 'Adjustment',
}

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind.replace(/_/g, ' ')
}

export function InvestorCapitalStatementDocument({
  data,
}: {
  data: InvestorStatementData
}) {
  const ledgerColumns: Column<InvestorStatementTx>[] = [
    { header: 'Date', flex: 1.4, render: (r) => format(new Date(r.date), 'd MMM yyyy') },
    { header: 'Kind', flex: 1.6, render: (r) => kindLabel(r.kind) },
    {
      header: 'Amount',
      flex: 1.2,
      align: 'right',
      render: (r) => formatGbp(r.amountPence),
    },
    { header: 'Notes', flex: 3, render: (r) => r.notes ?? '—' },
  ]

  // The "distributions" + "fees" totals come in negative (signed
  // ledger convention). Display as absolute for readability.
  const distributionsAbs = -data.distributionsPence
  const feesAbs = -data.feesPence

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader
          orgName={data.organisationName}
          reportTitle={`Capital statement — ${data.investorName}`}
          asOf={data.asOf}
        />

        <Text style={styles.h1}>Capital statement</Text>
        <Text style={styles.small}>
          {data.investorName} · {data.entityName} · {data.accountKind.replace(/_/g, ' ')}
        </Text>
        <Text style={styles.small}>
          Period: {format(data.period.from, 'd MMM yyyy')} — {format(data.period.to, 'd MMM yyyy')}
        </Text>

        <Text style={styles.h2}>Summary</Text>
        <View style={styles.table}>
          <SummaryRow label="Opening balance" right={formatGbp(data.openingBalancePence)} bold />
          <SummaryRow label="+ Contributions" right={formatGbp(data.contributionsPence)} />
          <SummaryRow label="+ Interest / accruals" right={formatGbp(data.accrualsPence)} />
          <SummaryRow label="− Distributions paid" right={formatGbp(distributionsAbs)} />
          <SummaryRow label="− Fees" right={formatGbp(feesAbs)} />
          <SummaryRow
            label="Closing balance"
            right={formatGbp(data.closingBalancePence)}
            bold
            divider
          />
        </View>

        <Text style={styles.h2}>Performance</Text>
        <View style={styles.table}>
          <SummaryRow label="Commitment" right={formatGbp(data.commitmentPence)} />
          <SummaryRow
            label="Money-weighted return (XIRR)"
            right={data.xirrBps === null ? '—' : bpsToPercent(data.xirrBps)}
          />
          {data.preferredReturnBps !== null && (
            <>
              <SummaryRow
                label="Preferred return"
                right={bpsToPercent(data.preferredReturnBps)}
              />
              <SummaryRow
                label="Pending preferred return"
                right={formatGbp(data.pendingPreferredReturnPence)}
              />
            </>
          )}
        </View>

        <Text style={styles.h2}>Transaction ledger</Text>
        {data.ledger.length === 0 ? (
          <Text style={styles.muted}>No transactions in the period.</Text>
        ) : (
          <Table columns={ledgerColumns} rows={data.ledger} />
        )}

        <Text style={[styles.small, { marginTop: 16, color: COLOR.muted }]}>
          Informational only. Not a tax statement. Consult your accountant for
          the appropriate treatment of contributions, distributions, and
          preferred returns under your jurisdiction.
        </Text>

        <ReportFooter />
      </Page>
    </Document>
  )
}

function SummaryRow({
  label,
  right,
  bold,
  divider,
}: {
  label: string
  right: string
  bold?: boolean
  divider?: boolean
}) {
  return (
    <View
      style={[
        styles.tr,
        divider ? { borderTopWidth: 1, borderTopColor: COLOR.borderStrong } : {},
      ]}
    >
      <Text style={[styles.td, { flex: 4, fontWeight: bold ? 'bold' : 'normal' }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.td,
          {
            flex: 1.2,
            textAlign: 'right',
            fontWeight: bold ? 'bold' : 'normal',
          },
        ]}
      >
        {right}
      </Text>
    </View>
  )
}
