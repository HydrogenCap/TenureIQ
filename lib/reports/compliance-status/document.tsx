// lib/reports/compliance-status/document.tsx

import { Document, Page, Text, View } from '@react-pdf/renderer'
import { styles, COLOR, statusColour } from '../styles'
import { ReportHeader, ReportFooter } from '../components/page-shell'
import { KpiGrid } from '../components/kpi-grid'
import { Table, type Column } from '../components/table'
import { format } from 'date-fns'
import type {
  ComplianceRow,
  ComplianceStatusData,
  PropertyGroup,
} from './types'

const KIND_LABELS: Record<string, string> = {
  gas_safety: 'Gas safety',
  eicr: 'EICR',
  epc: 'EPC',
  hmo_licence: 'HMO licence',
  fire_alarm: 'Fire alarm',
  fire_risk_assessment: 'Fire risk assessment',
  emergency_lighting: 'Emergency lighting',
  pat: 'PAT testing',
  legionella: 'Legionella',
  asbestos: 'Asbestos',
  insurance: 'Insurance',
  other: 'Other',
}

function PropertyBlock({ group }: { group: PropertyGroup }) {
  const columns: Column<ComplianceRow>[] = [
    {
      header: 'Kind',
      flex: 2,
      render: (r) => KIND_LABELS[r.kind] ?? r.kind.replace(/_/g, ' '),
    },
    {
      header: 'Status',
      flex: 1.2,
      render: (r) => (
        <Text
          style={{
            color: statusColour(r.status),
            fontWeight: 'bold',
            textTransform: 'uppercase',
            fontSize: 8,
          }}
        >
          {r.status}
        </Text>
      ),
    },
    {
      header: 'Issued',
      flex: 1.2,
      render: (r) =>
        r.issueDate ? format(new Date(r.issueDate), 'd MMM yyyy') : '—',
    },
    {
      header: 'Expires',
      flex: 1.2,
      render: (r) =>
        r.expiryDate ? format(new Date(r.expiryDate), 'd MMM yyyy') : '—',
    },
    {
      header: 'Issuer / note',
      flex: 2.4,
      render: (r) =>
        r.status === 'exempt' && r.exemptReason
          ? `Exempt: ${r.exemptReason}`
          : r.issuer ?? r.notes ?? '—',
    },
  ]

  return (
    <View wrap>
      <Text style={styles.h3}>
        {group.addressLine1}, {group.postcode} · {group.entityName}
      </Text>
      <Table columns={columns} rows={group.items} />
    </View>
  )
}

export function ComplianceStatusDocument({
  data,
}: {
  data: ComplianceStatusData
}) {
  const attention = data.totals.expired + data.totals.expiring + data.totals.missing

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader
          orgName={data.organisationName}
          reportTitle="Compliance status"
          asOf={data.asOf}
        />
        <Text style={styles.h1}>Compliance status</Text>
        <Text style={styles.small}>
          {data.groups.length}{' '}
          {data.groups.length === 1 ? 'property' : 'properties'}
          {data.entityFilter ? ' · filtered by entity' : ''}
        </Text>

        <KpiGrid
          tiles={[
            {
              label: 'Needs attention',
              display: String(attention),
              sub: 'Expired + expiring + missing',
            },
            { label: 'Valid', display: String(data.totals.valid) },
            { label: 'Expiring', display: String(data.totals.expiring) },
            { label: 'Expired / missing', display: String(data.totals.expired + data.totals.missing) },
          ]}
        />

        {attention > 0 && (
          <View style={styles.alert}>
            <Text style={{ fontWeight: 'bold' }}>
              {attention} compliance{' '}
              {attention === 1 ? 'item needs' : 'items need'} action.
            </Text>
            <Text>
              Items are sorted by severity: expired first, then missing,
              then expiring within 60 days.
            </Text>
          </View>
        )}

        <Text style={styles.h2}>By property</Text>
        {data.groups.length === 0 ? (
          <Text style={styles.muted}>No properties to report.</Text>
        ) : (
          data.groups.map((g) => <PropertyBlock key={g.propertyId} group={g} />)
        )}

        {data.totals.exempt > 0 && (
          <Text style={[styles.small, { marginTop: 12, color: COLOR.muted }]}>
            Exempt items: {data.totals.exempt}. MEES F/G exemptions and
            listed-building exceptions are recorded individually with the
            registered reason; see the property record for the supporting
            documentation.
          </Text>
        )}

        <ReportFooter />
      </Page>
    </Document>
  )
}
