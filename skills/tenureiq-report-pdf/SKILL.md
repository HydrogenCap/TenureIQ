---
name: tenureiq-report-pdf
description: PDF report generation pattern for TenureIQ using @react-pdf/renderer. Use when building any of the seven M10 reports (portfolio summary, entity P&L, property pack, compliance status, mortgage book, AASC placement, investor statement) or any new PDF output. Encodes font registration, page chrome, table component, page numbering, and the data-fetching shape that keeps reports performant.
---

# TenureIQ PDF Reports

`@react-pdf/renderer` is React-with-different-primitives. Powerful but with its own idioms. Without this skill, every report reinvents page chrome and the seven outputs drift visually.

## When to load deeper references

| Topic | Reference |
|---|---|
| Report layout primitives (page, header, footer, table) | `references/layout-primitives.md` |
| Data fetching for reports (server actions, streaming, large reports) | `references/data-fetching.md` |

## The seven reports (M10 scope)

| # | Report | Audience |
|---|---|---|
| 1 | Portfolio summary | Owner / monthly review |
| 2 | Entity P&L statement | Accountant / year-end |
| 3 | Property pack | Lender / refinance application |
| 4 | Compliance status report | LA inspector / insurance |
| 5 | Mortgage book | Lender / broker / refinance modelling |
| 6 | AASC placement report | Internal review / contractor reconciliation |
| 7 | Investor capital statement | Investor / quarterly |

All seven share 80% of their chrome — header, footer, page numbering, type stack, table component. Build once, reuse.

## File structure

```
lib/reports/
  components/                  # shared report primitives
    page-shell.tsx             # PageShell with header + footer
    section.tsx                # Section title + spacing
    kpi-grid.tsx               # 2x2 or 4-up KPI block
    table.tsx                  # data table primitive
    money.tsx                  # money cell with right-align
    cover-page.tsx             # title + subtitle + asof date
  styles.ts                    # the shared StyleSheet
  fonts.ts                     # font registration (Inter)
  portfolio-summary/
    document.tsx               # the report's <Document> composition
    fetch.ts                   # data-fetching server action
    types.ts                   # the report's data shape
  entity-pl/
    ...
  property-pack/
    ...
app/api/reports/[kind]/route.ts # route handler — streams the PDF
```

## Font registration

`@react-pdf` needs explicit font registration. Use Inter (matches the app UI font).

```ts
// lib/reports/fonts.ts
import { Font } from '@react-pdf/renderer'

Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://rsms.me/inter/font-files/Inter-Regular.woff', fontWeight: 400 },
    { src: 'https://rsms.me/inter/font-files/Inter-Medium.woff', fontWeight: 500 },
    { src: 'https://rsms.me/inter/font-files/Inter-SemiBold.woff', fontWeight: 600 },
    { src: 'https://rsms.me/inter/font-files/Inter-Bold.woff', fontWeight: 700 },
  ],
})

// Disable hyphenation — avoids ugly mid-word splits in money/codes
Font.registerHyphenationCallback((word) => [word])
```

For air-gapped production, mirror these fonts to your own CDN or bundle locally.

## The shared style sheet

```ts
// lib/reports/styles.ts
import { StyleSheet } from '@react-pdf/renderer'

export const styles = StyleSheet.create({
  page: {
    padding: 48,
    paddingBottom: 64,  // leave room for footer
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#0a0a0a',
    lineHeight: 1.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderBottom: '1pt solid #e5e5e5',
    paddingBottom: 12,
  },
  brand: { fontSize: 12, fontWeight: 600 },
  meta: { fontSize: 8, color: '#737373', textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#737373',
    borderTop: '1pt solid #e5e5e5',
    paddingTop: 8,
  },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 14, fontWeight: 600, marginTop: 20, marginBottom: 8 },
  h3: { fontSize: 11, fontWeight: 600, marginTop: 12, marginBottom: 4 },
  muted: { color: '#737373' },
  table: { display: 'flex', flexDirection: 'column' },
  tr: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e5e5e5',
    paddingVertical: 4,
  },
  thRow: { backgroundColor: '#f5f5f5', fontWeight: 600 },
  td: { paddingHorizontal: 6, fontSize: 9 },
  tdRight: { paddingHorizontal: 6, fontSize: 9, textAlign: 'right' },
  badgeOk: { color: '#16a34a', fontWeight: 600 },
  badgeWarn: { color: '#d97706', fontWeight: 600 },
  badgeBad: { color: '#dc2626', fontWeight: 600 },
})
```

## The page shell

```tsx
// lib/reports/components/page-shell.tsx
import { Page, Text, View } from '@react-pdf/renderer'
import { styles } from '../styles'

export function PageShell({
  title,
  subtitle,
  organisationName,
  asOf,
  children,
}: {
  title: string
  subtitle?: string
  organisationName: string
  asOf: Date
  children: React.ReactNode
}) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.header} fixed>
        <View>
          <Text style={styles.brand}>TenureIQ</Text>
          <Text style={styles.muted}>{organisationName}</Text>
        </View>
        <View style={styles.meta}>
          <Text>{title}</Text>
          {subtitle && <Text>{subtitle}</Text>}
          <Text>As of {asOf.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        </View>
      </View>

      {children}

      <View style={styles.footer} fixed>
        <Text>tenureiq.com</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  )
}
```

`fixed` on header and footer makes them render on every page. `wrap` lets content overflow naturally.

## The table primitive

```tsx
// lib/reports/components/table.tsx
import { View, Text } from '@react-pdf/renderer'
import { styles } from '../styles'

export type Column<T> = {
  key: string
  header: string
  width: string | number  // '20%' or 100 (points)
  align?: 'left' | 'right' | 'center'
  render: (row: T) => string | React.ReactNode
}

export function Table<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.thRow]}>
        {columns.map((c) => (
          <View key={c.key} style={{ width: c.width as any }}>
            <Text style={c.align === 'right' ? styles.tdRight : styles.td}>{c.header}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.tr} wrap={false}>
          {columns.map((c) => {
            const content = c.render(row)
            return (
              <View key={c.key} style={{ width: c.width as any }}>
                {typeof content === 'string' ? (
                  <Text style={c.align === 'right' ? styles.tdRight : styles.td}>{content}</Text>
                ) : (
                  content
                )}
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}
```

`wrap={false}` on rows prevents a single row breaking across pages — ugly.

## A concrete report: Portfolio Summary

```tsx
// lib/reports/portfolio-summary/document.tsx
import { Document, View, Text } from '@react-pdf/renderer'
import '../fonts'
import { PageShell } from '../components/page-shell'
import { Table, type Column } from '../components/table'
import { styles } from '../styles'
import { formatGbp, bpsToPercent } from '@/lib/money'

export type PortfolioRow = {
  address: string
  postcode: string
  entityName: string
  kind: string
  valuationPence: bigint
  balancePence: bigint
  equityPence: bigint
  ltvBps: number
  yieldBps: number
  epcRating: string | null
  meesStatus: 'compliant' | 'let_blocked' | 'epc_expired' | 'epc_missing'
}

export type PortfolioSummaryData = {
  organisationName: string
  asOf: Date
  totals: {
    propertyCount: number
    portfolioValuePence: bigint
    totalDebtPence: bigint
    totalEquityPence: bigint
    weightedLtvBps: number
    weightedYieldBps: number
    letBlockedCount: number
  }
  rows: PortfolioRow[]
}

const columns: Column<PortfolioRow>[] = [
  { key: 'address', header: 'Address', width: '24%', render: (r) => `${r.address}, ${r.postcode}` },
  { key: 'entity', header: 'Entity', width: '14%', render: (r) => r.entityName },
  { key: 'kind', header: 'Kind', width: '10%', render: (r) => r.kind.replace('_', ' ') },
  { key: 'epc', header: 'EPC', width: '6%', render: (r) => r.epcRating ?? '—' },
  { key: 'val', header: 'Value', width: '12%', align: 'right', render: (r) => formatGbp(r.valuationPence) },
  { key: 'debt', header: 'Debt', width: '12%', align: 'right', render: (r) => formatGbp(r.balancePence) },
  { key: 'ltv', header: 'LTV', width: '8%', align: 'right', render: (r) => bpsToPercent(r.ltvBps) },
  { key: 'yld', header: 'Yield', width: '8%', align: 'right', render: (r) => bpsToPercent(r.yieldBps) },
]

export function PortfolioSummaryDocument({ data }: { data: PortfolioSummaryData }) {
  return (
    <Document
      title={`TenureIQ Portfolio Summary — ${data.organisationName}`}
      author="TenureIQ"
    >
      <PageShell
        title="Portfolio Summary"
        organisationName={data.organisationName}
        asOf={data.asOf}
      >
        <Text style={styles.h1}>Portfolio Summary</Text>
        <Text style={styles.muted}>
          {data.totals.propertyCount} properties across {new Set(data.rows.map((r) => r.entityName)).size} entities
        </Text>

        <View style={[{ flexDirection: 'row', gap: 8, marginVertical: 12 }]}>
          <Kpi label="Portfolio value" value={formatGbp(data.totals.portfolioValuePence)} />
          <Kpi label="Total debt" value={formatGbp(data.totals.totalDebtPence)} />
          <Kpi label="Total equity" value={formatGbp(data.totals.totalEquityPence)} />
          <Kpi label="Weighted LTV" value={bpsToPercent(data.totals.weightedLtvBps)} />
        </View>

        {data.totals.letBlockedCount > 0 && (
          <View style={{ backgroundColor: '#fef2f2', padding: 8, marginBottom: 12, borderRadius: 4 }}>
            <Text style={[styles.badgeBad, { fontSize: 10 }]}>
              {data.totals.letBlockedCount} {data.totals.letBlockedCount === 1 ? 'property' : 'properties'} let-blocked (EPC F or G).
            </Text>
          </View>
        )}

        <Text style={styles.h2}>Properties</Text>
        <Table columns={columns} rows={data.rows} />
      </PageShell>
    </Document>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, borderWidth: 0.5, borderColor: '#e5e5e5', padding: 8, borderRadius: 4 }}>
      <Text style={{ fontSize: 8, color: '#737373' }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{value}</Text>
    </View>
  )
}
```

## The route handler

```ts
// app/api/reports/portfolio-summary/route.ts
import { NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { requireOrgMember } from '@/lib/auth/require'
import { fetchPortfolioSummaryData } from '@/lib/reports/portfolio-summary/fetch'
import { PortfolioSummaryDocument } from '@/lib/reports/portfolio-summary/document'

export async function GET() {
  const auth = await requireOrgMember()
  if (!auth.ok) return new NextResponse('Unauthorized', { status: 401 })

  const data = await fetchPortfolioSummaryData(auth.organisationId)

  const stream = await renderToStream(<PortfolioSummaryDocument data={data} />)

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="portfolio-summary-${new Date().toISOString().slice(0, 10)}.pdf"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
```

`renderToStream` is the streaming primitive — does not buffer the whole PDF in memory.

## Where to fetch data

Fetch in a dedicated `fetch.ts` per report. Use `supabaseServer()` (RLS-enforced) — the report runs in the user's session and should see only their org's data.

```ts
// lib/reports/portfolio-summary/fetch.ts
import { supabaseServer } from '@/lib/db/user'
import { equity, ltvBps } from '@/lib/domain/equity'
import { grossYieldBps } from '@/lib/domain/yield'
import { meesStatus } from '@/lib/domain/mees'
import type { PortfolioSummaryData } from './document'

export async function fetchPortfolioSummaryData(organisationId: string): Promise<PortfolioSummaryData> {
  const sb = await supabaseServer()

  const { data: org } = await sb.from('organisations').select('name').eq('id', organisationId).single()
  const { data: properties } = await sb
    .from('properties')
    .select(`
      address_line_1, postcode, kind, epc_rating, epc_expiry,
      current_valuation_pence, purchase_price_pence,
      entity:entities(name),
      mortgages(current_balance_pence)
    `)
    .is('deleted_at', null)

  const rows = (properties ?? []).map((p) => {
    const valuationPence = BigInt(p.current_valuation_pence ?? p.purchase_price_pence ?? 0)
    const balancePence = (p.mortgages ?? []).reduce(
      (sum: bigint, m: any) => sum + BigInt(m.current_balance_pence ?? 0),
      0n
    )
    return {
      address: p.address_line_1,
      postcode: p.postcode,
      entityName: (Array.isArray(p.entity) ? p.entity[0]?.name : p.entity?.name) ?? '—',
      kind: p.kind,
      valuationPence,
      balancePence,
      equityPence: equity({ valuationPence, balancePence }),
      ltvBps: ltvBps({ valuationPence, balancePence }),
      yieldBps: 0,  // populated when tenancies join added
      epcRating: p.epc_rating,
      meesStatus: meesStatus(p.epc_rating as any, p.epc_expiry),
    }
  })

  const portfolioValuePence = rows.reduce((s, r) => s + r.valuationPence, 0n)
  const totalDebtPence = rows.reduce((s, r) => s + r.balancePence, 0n)
  const totalEquityPence = portfolioValuePence - totalDebtPence
  const weightedLtvBps = portfolioValuePence === 0n ? 0 : Number((totalDebtPence * 10000n) / portfolioValuePence)
  const letBlockedCount = rows.filter((r) => r.meesStatus === 'let_blocked').length

  return {
    organisationName: org?.name ?? '—',
    asOf: new Date(),
    totals: {
      propertyCount: rows.length,
      portfolioValuePence,
      totalDebtPence,
      totalEquityPence,
      weightedLtvBps,
      weightedYieldBps: 0,
      letBlockedCount,
    },
    rows,
  }
}
```

## Triggering downloads from the UI

```tsx
// On a Reports page
<Button asChild>
  <a href="/api/reports/portfolio-summary" target="_blank" rel="noopener">
    Download portfolio summary
  </a>
</Button>
```

For "email me this report" flows: hit a server action that calls `renderToBuffer` (instead of `renderToStream`), uploads to a private bucket with a signed URL, and emails the link.

## Anti-patterns

1. Buffering the whole PDF (`renderToBuffer`) for an on-screen download — use `renderToStream`.
2. Hardcoding numbers in the report — always fetch from the database, even for "totals" the user just saw on the dashboard.
3. Inline styles repeated across reports — use the shared `styles` stylesheet.
4. Letting a row break across a page mid-content — `wrap={false}` on row Views.
5. Charts rendered as raster images embedded in the PDF — Recharts is web-only. For PDF charts, use `@react-pdf/renderer`'s native primitives or generate SVG server-side.
6. Reports that load every property's full join in one query — use the data shape the report needs, not the application's full property graph.
