// app/api/reports/aasc-placements/route.tsx
//
// Streams the AASC placement report. Auth-gated via requireOrgMember();
// fetch uses supabaseServer() so RLS handles tenant isolation. No
// service-role usage. NO service-user identity fields in the output —
// see lib/reports/aasc-placements/types.ts header.

import { NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { requireOrgMember } from '@/lib/auth/require'
import { fetchAascPlacements } from '@/lib/reports/aasc-placements/fetch'
import { AascPlacementsDocument } from '@/lib/reports/aasc-placements/document'
import { nodeReadableToWebStream } from '@/lib/adapters/pdf-stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(): Promise<Response> {
  const auth = await requireOrgMember()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const data = await fetchAascPlacements(auth.organisationId)
  const nodeStream = await renderToStream(<AascPlacementsDocument data={data} />)
  const webStream = nodeReadableToWebStream(nodeStream)

  const filename = `tenureiq-aasc-placements-${data.asOf
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
