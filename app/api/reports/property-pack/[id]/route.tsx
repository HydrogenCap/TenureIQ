// app/api/reports/property-pack/[id]/route.tsx
//
// Streams the full property profile as a PDF. Auth-gated; the
// underlying fetch uses supabaseServer() so RLS handles cross-org.

import { NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { requireOrgMember } from '@/lib/auth/require'
import { fetchPropertyPack } from '@/lib/reports/property-pack/fetch'
import { PropertyPackDocument } from '@/lib/reports/property-pack/document'
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

  const data = await fetchPropertyPack(id, auth.organisationId)
  if (!data) {
    return NextResponse.json({ ok: false, error: 'property not found' }, { status: 404 })
  }

  const nodeStream = await renderToStream(<PropertyPackDocument data={data} />)
  const webStream = nodeReadableToWebStream(nodeStream)

  const slug = `${data.addressLine1}-${data.postcode}`
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
  const filename = `tenureiq-property-pack-${slug}-${data.asOf
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
