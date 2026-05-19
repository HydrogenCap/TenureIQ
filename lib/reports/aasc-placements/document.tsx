// lib/reports/aasc-placements/document.tsx
//
// AASC placement report. Per the data-protection contract, the only
// per-placement number that identifies people is `service_user_count`
// — there are no names, DOBs, or nationalities anywhere in this
// document.

import { Document, Page, Text, View } from '@react-pdf/renderer'
import { styles, COLOR } from '../styles'
import { ReportHeader, ReportFooter } from '../components/page-shell'
import { KpiGrid } from '../components/kpi-grid'
import { Table, type Column } from '../components/table'
import { formatGbp } from '@/lib/money'
import { format } from 'date-fns'
import type { AascPlacementsData, PlacementRow } from './types'

function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return format(new Date(iso), 'd MMM yyyy')
}

function contractorLabel(c: PlacementRow['contractor']): string {
  if (c === 'clearsprings') return 'Clearsprings'
  if (c === 'serco') return 'Serco'
  return '—'
}

export function AascPlacementsDocument({ data }: { data: AascPlacementsData }) {
  const activeRows = data.rows.filter((r) => r.status === 'active')
  const inactiveRows = data.rows.filter((r) => r.status !== 'active')

  const columns: Column<PlacementRow>[] = [
    { header: 'Ref', flex: 1.2, render: (r) => r.placementRef },
    {
      header: 'Property',
      flex: 2.6,
      render: (r) => `${r.propertyAddressLine1}, ${r.propertyPostcode}`,
    },
    { header: 'Contractor', flex: 1.1, render: (r) => contractorLabel(r.contractor) },
    {
      header: 'Service users',
      flex: 0.9,
      align: 'right',
      render: (r) => String(r.serviceUserCount),
    },
    {
      header: 'Weekly',
      flex: 1.1,
      align: 'right',
      render: (r) => formatGbp(r.weeklyRatePence * BigInt(r.serviceUserCount)),
    },
    {
      header: 'Annual gross',
      flex: 1.3,
      align: 'right',
      render: (r) => formatGbp(r.annualGrossPence),
    },
    {
      header: 'Annual net',
      flex: 1.3,
      align: 'right',
      render: (r) => formatGbp(r.annualNetPence),
    },
    {
      header: 'Start',
      flex: 1.0,
      render: (r) => shortDate(r.startDate),
    },
    {
      header: 'Status',
      flex: 0.9,
      render: (r) => r.status,
    },
  ]

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <ReportHeader
          orgName={data.organisationName}
          reportTitle="AASC placement report"
          asOf={data.asOf}
        />

        <View>
          <Text style={styles.h1}>AASC placement report</Text>
          <Text style={styles.small}>
            {data.totals.activePlacementCount}{' '}
            {data.totals.activePlacementCount === 1
              ? 'active placement'
              : 'active placements'}{' '}
            housing {data.totals.totalServiceUserCount} service users
          </Text>

          <KpiGrid
            tiles={[
              {
                label: 'Active placements',
                display: String(data.totals.activePlacementCount),
              },
              {
                label: 'Service users',
                display: String(data.totals.totalServiceUserCount),
              },
              {
                label: 'Annual gross',
                display: formatGbp(data.totals.annualGrossPence),
                sub: `Net: ${formatGbp(data.totals.annualNetPence)}`,
              },
              {
                label: 'Weekly gross',
                display: formatGbp(data.totals.weeklyGrossPence),
              },
            ]}
          />

          {data.nextContractEventDate && (
            <View style={styles.alert} wrap={false}>
              <Text style={{ fontWeight: 'bold' }}>
                Next contract event — {shortDate(data.nextContractEventDate)}
              </Text>
              <Text style={{ marginTop: 4 }}>
                Earliest break clause or contract-end across the active
                contracts. Diary it.
              </Text>
            </View>
          )}

          <Text style={styles.h2}>Active placements</Text>
          {activeRows.length === 0 ? (
            <Text style={styles.small}>No active placements.</Text>
          ) : (
            <Table columns={columns} rows={activeRows} />
          )}

          {inactiveRows.length > 0 && (
            <>
              <Text style={styles.h2}>Ended / terminated</Text>
              <Table columns={columns} rows={inactiveRows} />
            </>
          )}

          <Text style={[styles.small, { marginTop: 16, color: COLOR.muted }]}>
            Service-user counts only. No identity fields are stored or
            reported per the data-protection contract with prime contractors.
          </Text>
        </View>

        <ReportFooter />
      </Page>
    </Document>
  )
}
