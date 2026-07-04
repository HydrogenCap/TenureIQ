// app/(app)/search-actions.ts
// Global Cmd+K search. One server action fans out five parallel queries so
// the palette stays a thin client. Every query is RLS-scoped AND explicitly
// filtered by organisation_id + deleted_at (belt and braces, per convention).
'use server'

import { z } from 'zod'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import type { ActionResult } from '@/lib/types/action-result'

const SearchSchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(100),
})

export type SearchKind = 'property' | 'tenant' | 'entity' | 'mortgage' | 'transaction'

export type SearchHit = {
  id: string
  label: string
  detail: string | null
  href: string
}

export type SearchGroup = { kind: SearchKind; hits: SearchHit[] }

export type SearchResults = { groups: SearchGroup[] }

// Escape LIKE wildcards so a user typing "100%" or "flat_2" matches
// literally instead of turning into a wildcard scan.
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
}

// .or() filter strings are parsed by PostgREST as a comma-separated list of
// `col.op.value` triples, so unquoted commas/parens in user input would
// break the parse (or worse, inject extra clauses). Double-quoting the value
// makes it opaque to the parser; inside quotes, `\` and `"` are escaped with
// a backslash.
function quotedLikePattern(q: string): string {
  const escaped = likePattern(q).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

// The generated Database type is still the `any` stub, so row shapes are
// asserted the same way the rest of the codebase does it.
type PropertyRow = { id: string; address_line_1: string; postcode: string }
type TenantRow = { id: string; first_name: string; last_name: string; email: string | null }
type EntityRow = { id: string; name: string; kind: string }
type MortgageRow = { id: string; lender: string; account_ref: string | null }
type TransactionRow = { id: string; description: string; posted_at: string }
type TenancyLinkRow = { id: string; tenant_id: string | null }

const RESULT_LIMIT = 5

export async function globalSearch(input: unknown): Promise<ActionResult<SearchResults>> {
  const auth = await requireOrgMember()
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = SearchSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const sb = await supabaseServer()
  const orgId = auth.organisationId
  const like = likePattern(parsed.data.q) // single-column .ilike() — sent as its own param, no quoting needed
  const orLike = quotedLikePattern(parsed.data.q) // multi-column .or() strings

  const [properties, tenants, entities, mortgages, transactions] = await Promise.all([
    sb
      .from('properties')
      .select('id, address_line_1, postcode')
      .eq('organisation_id', orgId)
      .is('deleted_at', null)
      .or(`address_line_1.ilike.${orLike},postcode.ilike.${orLike}`)
      .limit(RESULT_LIMIT),
    sb
      .from('tenants')
      .select('id, first_name, last_name, email')
      .eq('organisation_id', orgId)
      .is('deleted_at', null)
      .or(`first_name.ilike.${orLike},last_name.ilike.${orLike},email.ilike.${orLike}`)
      .limit(RESULT_LIMIT),
    sb
      .from('entities')
      .select('id, name, kind')
      .eq('organisation_id', orgId)
      .is('deleted_at', null)
      .ilike('name', like)
      .limit(RESULT_LIMIT),
    sb
      .from('mortgages')
      .select('id, lender, account_ref')
      .eq('organisation_id', orgId)
      .is('deleted_at', null)
      .or(`lender.ilike.${orLike},account_ref.ilike.${orLike}`)
      .limit(RESULT_LIMIT),
    sb
      .from('transactions')
      .select('id, description, posted_at')
      .eq('organisation_id', orgId)
      .is('deleted_at', null)
      .or(`description.ilike.${orLike},reference.ilike.${orLike}`)
      .limit(RESULT_LIMIT),
  ])

  const firstError =
    properties.error ?? tenants.error ?? entities.error ?? mortgages.error ?? transactions.error
  if (firstError) return { ok: false, error: firstError.message }

  // Tenants have no directory page — deep-link each hit to its most recent
  // tenancy (tenancies.tenant_id), falling back to the tenancies list for
  // tenants with no live tenancy row.
  const tenantRows = (tenants.data ?? []) as TenantRow[]
  const tenancyByTenant = new Map<string, string>()
  if (tenantRows.length > 0) {
    const { data: tenancyRows, error: tenancyError } = await sb
      .from('tenancies')
      .select('id, tenant_id')
      .eq('organisation_id', orgId)
      .is('deleted_at', null)
      .in(
        'tenant_id',
        tenantRows.map((t) => t.id),
      )
      .order('start_date', { ascending: false })
    if (tenancyError) return { ok: false, error: tenancyError.message }
    for (const row of (tenancyRows ?? []) as TenancyLinkRow[]) {
      // Rows are newest-first; keep the first (most recent) tenancy per tenant.
      if (row.tenant_id && !tenancyByTenant.has(row.tenant_id)) {
        tenancyByTenant.set(row.tenant_id, row.id)
      }
    }
  }

  const groups: SearchGroup[] = [
    {
      kind: 'property',
      hits: ((properties.data ?? []) as PropertyRow[]).map((p) => ({
        id: p.id,
        label: `${p.address_line_1}, ${p.postcode}`,
        detail: null,
        href: `/properties/${p.id}`,
      })),
    },
    {
      kind: 'tenant',
      hits: tenantRows.map((t) => {
        const tenancyId = tenancyByTenant.get(t.id)
        return {
          id: t.id,
          label: `${t.first_name} ${t.last_name}`,
          detail: t.email,
          href: tenancyId ? `/tenancies/${tenancyId}` : '/tenancies',
        }
      }),
    },
    {
      kind: 'entity',
      hits: ((entities.data ?? []) as EntityRow[]).map((e) => ({
        id: e.id,
        label: e.name,
        detail: e.kind,
        href: `/entities/${e.id}`,
      })),
    },
    {
      kind: 'mortgage',
      hits: ((mortgages.data ?? []) as MortgageRow[]).map((m) => ({
        id: m.id,
        label: m.lender,
        detail: m.account_ref,
        href: `/mortgages/${m.id}`,
      })),
    },
    {
      kind: 'transaction',
      hits: ((transactions.data ?? []) as TransactionRow[]).map((t) => ({
        id: t.id,
        label: t.description,
        detail: t.posted_at,
        href: `/transactions/${t.id}`,
      })),
    },
  ]

  // Empty groups are dropped server-side so the client renders exactly what
  // it receives — no phantom headings.
  return { ok: true, data: { groups: groups.filter((g) => g.hits.length > 0) } }
}
