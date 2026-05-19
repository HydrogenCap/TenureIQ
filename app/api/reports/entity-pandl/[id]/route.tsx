// app/api/reports/entity-pandl/[id]/route.tsx
//
// Streams the per-entity YTD P&L statement as a PDF. Auth-gated via
// requireOrgMember(); the underlying fetch uses supabaseServer() so
// RLS handles the cross-org boundary.

import { NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { requireOrgMember } from '@/lib/auth/require'
import { fetchEntityPandL } from '@/lib/reports/entity-pandl/fetch'
import { EntityPandLDocument } from '@/lib/reports/entity-pandl/document'
import { nodeReadableToWebStream } from '@/lib/adapters/pdf-stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const auth = await requireOrgMember()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const data = await fetchEntityPandL(id, auth.organisationId)
  if (data.entityName === '—') {
    return NextResponse.json({ ok: false, error: 'entity not found' }, { status: 404 })
  }

  const nodeStream = await renderToStream(<EntityPandLDocument data={data} />)
  const webStream = nodeReadableToWebStream(nodeStream)

  const filename = `tenureiq-pandl-${data.entityName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${data.asOf
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
