// app/api/reports/compliance-status/route.tsx

import { NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { requireOrgMember } from '@/lib/auth/require'
import { fetchComplianceStatus } from '@/lib/reports/compliance-status/fetch'
import { ComplianceStatusDocument } from '@/lib/reports/compliance-status/document'
import { nodeReadableToWebStream } from '@/lib/adapters/pdf-stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: Request): Promise<Response> {
  const auth = await requireOrgMember()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const url = new URL(req.url)
  const entityId = url.searchParams.get('entityId')
  // UUID validation — anything else gets ignored rather than throwing
  // at the DB layer.
  const cleanEntityId =
    entityId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId)
      ? entityId
      : null

  const data = await fetchComplianceStatus(auth.organisationId, cleanEntityId)
  const stream = await renderToStream(<ComplianceStatusDocument data={data} />)
  return new Response(nodeReadableToWebStream(stream), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="tenureiq-compliance-${data.asOf
        .toISOString()
        .slice(0, 10)}.pdf"`,
    },
  })
}
