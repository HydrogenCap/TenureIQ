// lib/reports/property-pack/document.tsx
// Full property profile for an investor pitch or refinance application.

import { Document, Page, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { styles, COLOR } from '../styles'
import { ReportHeader, ReportFooter } from '../components/page-shell'
import { KpiGrid } from '../components/kpi-grid'
import { Table, type Column } from '../components/table'
import { formatGbp, bpsToPercent } from '@/lib/money'
import type {
  PropertyPackData,
  PropertyPackMortgage,
  PropertyPackTenancy,
  PropertyPackValuation,
  PropertyPackComplianceRow,
} from './types'

function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return format(new Date(iso), 'd MMM yyyy')
}

function meesLabel(s: PropertyPackData['meesStatus']): {
  text: string
  isBad: boolean
} {
  switch (s) {
    case 'let_blocked':
      return { text: 'Let blocked (EPC F/G)', isBad: true }
    case 'epc_expired':
      return { text: 'EPC expired', isBad: true }
    case 'epc_missing':
      return { text: 'EPC missing', isBad: true }
    case 'compliant':
      return { text: 'MEES compliant', isBad: false }
  }
}

function complianceColor(s: PropertyPackComplianceRow['status']): string {
  switch (s) {
    case 'valid':
      return COLOR.text
    case 'exempt':
      return COLOR.muted
    case 'expiring':
      return COLOR.warning
    case 'expired':
    case 'missing':
      return COLOR.destructive
  }
}

function DetailRow({
  rowLabel,
  rowValue,
}: {
  rowLabel: string
  rowValue: string
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingVertical: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: COLOR.border,
      }}
      wrap={false}
    >
      <Text style={{ flex: 1.4, color: COLOR.muted, fontSize: 9 }}>
        {rowLabel}
      </Text>
      <Text style={{ flex: 2, fontSize: 9 }}>{rowValue}</Text>
    </View>
  )
}

export function PropertyPackDocument({ data }: { data: PropertyPackData }) {
  const fullAddress = [
    data.addressLine1,
    data.addressLine2,
    data.city,
    data.county,
    data.postcode,
  ]
    .filter(Boolean)
    .join(', ')

  const mees = meesLabel(data.meesStatus)

  const mortgageColumns: Column<PropertyPackMortgage>[] = [
    { header: 'Lender / product', flex: 2.2, render: (m) => `${m.lender} · ${m.product}${m.isInterestOnly ? ' · IO' : ''}` },
    {
      header: 'Balance',
      flex: 1.3,
      align: 'right',
      render: (m) => formatGbp(m.balancePence),
    },
    {
      header: 'Rate',
      flex: 0.9,
      align: 'right',
      render: (m) => bpsToPercent(m.interestRateBps),
    },
    {
      header: 'Monthly',
      flex: 1.2,
      align: 'right',
      render: (m) => formatGbp(m.monthlyPaymentPence),
    },
    {
      header: 'Fixed end',
      flex: 1.2,
      render: (m) => shortDate(m.fixedEndDate),
    },
  ]

  const valuationColumns: Column<PropertyPackValuation>[] = [
    { header: 'Date', flex: 1.2, render: (v) => shortDate(v.valuationDate) },
    { header: 'Kind', flex: 1.4, render: (v) => v.kind.replace(/_/g, ' ') },
    {
      header: 'Value',
      flex: 1.4,
      align: 'right',
      render: (v) => formatGbp(v.valuePence),
    },
    { header: 'Source', flex: 2, render: (v) => v.source ?? '—' },
  ]

  const tenancyColumns: Column<PropertyPackTenancy>[] = [
    { header: 'Kind', flex: 1.2, render: (t) => t.kind.replace(/_/g, ' ') },
    { header: 'Start', flex: 1.2, render: (t) => shortDate(t.startDate) },
    {
      header: 'End (intended)',
      flex: 1.4,
      render: (t) => shortDate(t.endDateIntended),
    },
    {
      header: 'Rent / period',
      flex: 1.6,
      align: 'right',
      render: (t) => `${formatGbp(t.rentPence)} ${t.rentPeriod.replace(/_/g, ' ')}`,
    },
    {
      header: 'Monthly',
      flex: 1.4,
      align: 'right',
      render: (t) => formatGbp(t.monthlyRentPence),
    },
    { header: 'Status', flex: 1, render: (t) => t.status },
  ]

  const complianceColumns: Column<PropertyPackComplianceRow>[] = [
    {
      header: 'Item',
      flex: 2,
      render: (c) => c.kind.replace(/_/g, ' '),
    },
    {
      header: 'Status',
      flex: 1.2,
      render: (c) => (
        <Text style={{ color: complianceColor(c.status), fontWeight: 'bold' }}>
          {c.status}
        </Text>
      ),
    },
    {
      header: 'Expires',
      flex: 1.4,
      render: (c) => shortDate(c.expiryDate),
    },
    { header: 'Issuer', flex: 2, render: (c) => c.issuer ?? '—' },
  ]

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader
          orgName={data.organisationName}
          reportTitle={`Property pack — ${data.addressLine1}`}
          asOf={data.asOf}
        />

        <View>
          <Text style={styles.h1}>{data.addressLine1}</Text>
          <Text style={styles.small}>{fullAddress}</Text>

          <KpiGrid
            tiles={[
              {
                label: 'Current value',
                display:
                  data.currentValuationPence === null
                    ? formatGbp(data.purchasePricePence)
                    : formatGbp(data.currentValuationPence),
                sub:
                  data.currentValuationPence === null
                    ? 'at purchase'
                    : `as of ${shortDate(data.currentValuationAsOf)}`,
              },
              {
                label: 'Equity',
                display: formatGbp(data.equityPence),
                sub:
                  data.totalDebtPence === 0n
                    ? 'unencumbered'
                    : `debt ${formatGbp(data.totalDebtPence)}`,
              },
              {
                label: 'LTV',
                display: data.ltvBps === null ? '—' : bpsToPercent(data.ltvBps),
              },
              {
                label: 'Gross yield',
                display:
                  data.grossYieldBps === null
                    ? '—'
                    : bpsToPercent(data.grossYieldBps),
                sub:
                  data.weeklyRentRollPence > 0n
                    ? `${formatGbp(data.weeklyRentRollPence)} weekly rent`
                    : 'no rent roll',
              },
            ]}
          />

          {mees.isBad && (
            <View style={styles.alert} wrap={false}>
              <Text style={{ fontWeight: 'bold' }}>{mees.text}</Text>
              <Text style={{ marginTop: 4 }}>
                {data.meesStatus === 'let_blocked'
                  ? 'EPC F or G with no recorded exemption. Cannot legally be let — see lib/domain/mees.'
                  : data.meesStatus === 'epc_expired'
                    ? 'EPC certificate has expired. Renew before re-letting.'
                    : 'No EPC certificate on file.'}
              </Text>
            </View>
          )}

          <Text style={styles.h2}>Property details</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <DetailRow rowLabel="Entity" rowValue={data.entityName ?? '—'} />
              <DetailRow rowLabel="Kind" rowValue={data.kind.replace(/_/g, ' ')} />
              <DetailRow
                rowLabel="Bedrooms"
                rowValue={data.bedroomsTotal?.toString() ?? '—'}
              />
              <DetailRow
                rowLabel="Bathrooms"
                rowValue={data.bathroomsTotal?.toString() ?? '—'}
              />
              <DetailRow
                rowLabel="Internal area"
                rowValue={
                  data.internalAreaSqm === null
                    ? '—'
                    : `${data.internalAreaSqm.toFixed(1)} sqm`
                }
              />
              <DetailRow
                rowLabel="Local authority"
                rowValue={data.localAuthority ?? '—'}
              />
              <DetailRow
                rowLabel="Article 4 area"
                rowValue={data.article4Area ? 'Yes' : 'No'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <DetailRow rowLabel="Purchased" rowValue={shortDate(data.purchaseDate)} />
              <DetailRow
                rowLabel="Purchase price"
                rowValue={formatGbp(data.purchasePricePence)}
              />
              <DetailRow
                rowLabel="SDLT paid"
                rowValue={
                  data.sdltPaidPence === null ? '—' : formatGbp(data.sdltPaidPence)
                }
              />
              <DetailRow
                rowLabel="Refurb cost"
                rowValue={
                  data.refurbCostPence === null
                    ? '—'
                    : formatGbp(data.refurbCostPence)
                }
              />
              <DetailRow
                rowLabel="Acquisition costs"
                rowValue={
                  data.acquisitionCostsPence === null
                    ? '—'
                    : formatGbp(data.acquisitionCostsPence)
                }
              />
              <DetailRow
                rowLabel="All-in cost"
                rowValue={formatGbp(data.allInCostPence)}
              />
              <DetailRow rowLabel="EPC" rowValue={data.epcRating ?? '—'} />
            </View>
          </View>

          {(data.hmoLicenceKind && data.hmoLicenceKind !== 'none') ||
          data.hmoPermittedOccupancy ? (
            <>
              <Text style={styles.h2}>HMO licence</Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <DetailRow
                    rowLabel="Licence kind"
                    rowValue={data.hmoLicenceKind ?? '—'}
                  />
                  <DetailRow
                    rowLabel="Reference"
                    rowValue={data.hmoLicenceRef ?? '—'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <DetailRow
                    rowLabel="Expiry"
                    rowValue={shortDate(data.hmoLicenceExpiry)}
                  />
                  <DetailRow
                    rowLabel="Permitted occupancy"
                    rowValue={data.hmoPermittedOccupancy?.toString() ?? '—'}
                  />
                </View>
              </View>
            </>
          ) : null}

          <Text style={styles.h2}>
            Mortgages ({data.mortgages.length})
          </Text>
          {data.mortgages.length === 0 ? (
            <Text style={styles.small}>Unencumbered.</Text>
          ) : (
            <Table columns={mortgageColumns} rows={data.mortgages} />
          )}

          <Text style={styles.h2}>
            Valuations ({data.valuations.length})
          </Text>
          {data.valuations.length === 0 ? (
            <Text style={styles.small}>No valuations recorded.</Text>
          ) : (
            <Table columns={valuationColumns} rows={data.valuations} />
          )}

          <Text style={styles.h2}>
            Tenancies ({data.tenancies.length})
          </Text>
          {data.tenancies.length === 0 ? (
            <Text style={styles.small}>No tenancy history.</Text>
          ) : (
            <Table columns={tenancyColumns} rows={data.tenancies} />
          )}

          <Text style={styles.h2}>
            Compliance ({data.compliance.length})
          </Text>
          {data.compliance.length === 0 ? (
            <Text style={styles.small}>
              No compliance items recorded for this property.
            </Text>
          ) : (
            <Table columns={complianceColumns} rows={data.compliance} />
          )}

          {data.notes && (
            <>
              <Text style={styles.h2}>Notes</Text>
              <Text style={[styles.small, { color: COLOR.text }]}>
                {data.notes}
              </Text>
            </>
          )}
        </View>

        <ReportFooter />
      </Page>
    </Document>
  )
}
