// app/api/reports/portfolio-summary/route.ts
//
// Streams the portfolio summary as a PDF. Auth-gated via
// requireOrgMember(); the underlying fetch uses supabaseServer() so
// RLS handles the cross-org boundary. No service-role usage here.

import { NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { requireOrgMember } from '@/lib/auth/require'
import { fetchPortfolioSummary } from '@/lib/reports/portfolio-summary/fetch'
import { PortfolioSummaryDocument } from '@/lib/reports/portfolio-summary/document'
import { nodeReadableToWebStream } from '@/lib/adapters/pdf-stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(): Promise<Response> {
  const auth = await requireOrgMember()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const data = await fetchPortfolioSummary(auth.organisationId)
  const nodeStream = await renderToStream(<PortfolioSummaryDocument data={data} />)
  const webStream = nodeReadableToWebStream(nodeStream)

  const filename = `tenureiq-portfolio-summary-${data.asOf
    .toISOString()
    .slice(0, 10)}.pdf`

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
