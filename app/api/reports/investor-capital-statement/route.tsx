// app/api/reports/investor-capital-statement/route.tsx

import { NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { requireOrgMember } from '@/lib/auth/require'
import { fetchInvestorCapitalStatement } from '@/lib/reports/investor-capital-statement/fetch'
import { InvestorCapitalStatementDocument } from '@/lib/reports/investor-capital-statement/document'
import { nodeReadableToWebStream } from '@/lib/adapters/pdf-stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseDateOr(s: string | null, fallback: Date): Date {
  if (!s) return fallback
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? fallback : d
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireOrgMember()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const url = new URL(req.url)
  const accountId = url.searchParams.get('accountId') ?? ''
  if (!UUID_RE.test(accountId)) {
    return NextResponse.json(
      { ok: false, error: 'accountId required' },
      { status: 400 },
    )
  }

  // Default period: the current calendar quarter ending today.
  const today = new Date()
  const defaultFrom = new Date(today)
  defaultFrom.setMonth(defaultFrom.getMonth() - 3)
  const from = parseDateOr(url.searchParams.get('fromDate'), defaultFrom)
  const to = parseDateOr(url.searchParams.get('toDate'), today)

  const data = await fetchInvestorCapitalStatement({
    organisationId: auth.organisationId,
    accountId,
    from,
    to,
  })
  if (!data) {
    return NextResponse.json(
      { ok: false, error: 'Account not found in your organisation.' },
      { status: 404 },
    )
  }
  const stream = await renderToStream(
    <InvestorCapitalStatementDocument data={data} />,
  )
  return new Response(nodeReadableToWebStream(stream), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="tenureiq-investor-statement-${to
        .toISOString()
        .slice(0, 10)}.pdf"`,
    },
  })
}
