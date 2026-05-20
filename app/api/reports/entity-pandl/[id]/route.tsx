// app/api/reports/entity-pandl/[id]/route.tsx
//
// Streams the per-entity YTD P&L statement as a PDF. Auth-gated via
// requireOrgMember(); the underlying fetch uses supabaseServer() so
// RLS handles the cross-org boundary.

import { NextResponse } from 'next/server'
import { z } from 'zod'
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
  // Validate the route param before the fetch. The fetch interpolates
  // entityId into a Postgrest .or() filter string; rejecting non-UUID
  // input at the boundary closes the injection vector even though the
  // .eq('organisation_id', …) elsewhere in the query would still gate
  // the result set.
  const idParse = z.string().uuid().safeParse(id)
  if (!idParse.success) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
  }
  const auth = await requireOrgMember()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const data = await fetchEntityPandL(idParse.data, auth.organisationId)
  if (!data) {
    return NextResponse.json({ ok: false, error: 'entity not found' }, { status: 404 })
  }

  const nodeStream = await renderToStream(<EntityPandLDocument data={data} />)
  const webStream = nodeReadableToWebStream(nodeStream)

  const nameSlug = data.entityName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
  const slug = nameSlug.length > 0 ? nameSlug : idParse.data.slice(0, 8)
  const filename = `tenureiq-pandl-${slug}-${data.asOf
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
