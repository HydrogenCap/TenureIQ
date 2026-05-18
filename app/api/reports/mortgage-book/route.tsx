// app/api/reports/mortgage-book/route.tsx

import { NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { requireOrgMember } from '@/lib/auth/require'
import { fetchMortgageBook } from '@/lib/reports/mortgage-book/fetch'
import { MortgageBookDocument } from '@/lib/reports/mortgage-book/document'
import { nodeReadableToWebStream } from '@/lib/adapters/pdf-stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(): Promise<Response> {
  const auth = await requireOrgMember()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const data = await fetchMortgageBook(auth.organisationId)
  const stream = await renderToStream(<MortgageBookDocument data={data} />)
  return new Response(nodeReadableToWebStream(stream), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="tenureiq-mortgage-book-${data.asOf
        .toISOString()
        .slice(0, 10)}.pdf"`,
    },
  })
}
