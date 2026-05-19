// app/(app)/tenancies/import/actions.ts
//
// Commits a batch of tenancy rows from the CSV wizard. Each row is
// independently validated server-side; per-row failures (postcode
// ambiguous, MEES blocked, etc.) are reported back as `rowErrors` so
// the wizard can show "5 imported, 3 failed" with reasons.

'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { meesStatus, type EpcBand } from '@/lib/domain/mees'
import { pencePreprocessor } from '@/lib/money'
import type { ActionResult } from '@/lib/types/action-result'
import { TENANCY_KINDS, RENT_PERIODS } from '@/lib/schemas/tenancy'

// Lenient row shape — postcode OR property_id resolves; tenant fields
// optional for non-AST kinds.
const TenancyImportRowSchema = z.object({
  propertyPostcode: z.string().trim().nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  unitLabel: z.string().trim().nullable().optional(),
  kind: z.enum(TENANCY_KINDS).default('ast'),
  startDate: z.coerce.date(),
  endDateIntended: z.preprocess(
    (v) => (v === null || v === undefined || v === '' ? null : v),
    z.coerce.date().nullable(),
  ),
  rentPence: z.preprocess(pencePreprocessor, z.bigint().nonnegative()),
  rentPeriod: z.enum(RENT_PERIODS).default('monthly'),
  tenantFirstName: z.string().trim().nullable().optional(),
  tenantLastName: z.string().trim().nullable().optional(),
  tenantEmail: z.preprocess(
    (v) => (v === null || v === undefined || v === '' ? null : v),
    z.string().email().nullable(),
  ),
  notes: z.string().trim().nullable().optional(),
})

const BatchSchema = z.array(TenancyImportRowSchema).min(1).max(50)

export type CommitTenancyImportResult = {
  inserted: number
  rowErrors: Array<{ rowIndex: number; error: string }>
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function commitTenancyImport(
  batch: unknown,
  startingRowIndex: number,
): Promise<ActionResult<CommitTenancyImportResult>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = BatchSchema.safeParse(batch)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: `Batch shape invalid at ${first?.path.join('.') ?? 'unknown'}: ${first?.message ?? 'unknown'}`,
    }
  }

  const sb = await supabaseServer()
  const rowErrors: Array<{ rowIndex: number; error: string }> = []
  let inserted = 0

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i]
    if (!row) continue
    const rowIndex = startingRowIndex + i

    // 1. Resolve the property — either explicit ID or by postcode lookup.
    let propertyId = row.propertyId ?? null
    if (!propertyId) {
      if (!row.propertyPostcode) {
        rowErrors.push({ rowIndex, error: 'Provide property_id or postcode' })
        continue
      }
      const normalisedPostcode = row.propertyPostcode
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/^(.*)(.{3})$/, '$1 $2')
        .trim()
      const { data: candidates } = await sb
        .from('properties')
        .select('id, epc_rating, epc_expiry')
        .eq('postcode', normalisedPostcode)
        .eq('organisation_id', auth.organisationId)
        .is('deleted_at', null)
      const list = (candidates ?? []) as Array<{
        id: string
        epc_rating: string | null
        epc_expiry: string | null
      }>
      if (list.length === 0) {
        rowErrors.push({ rowIndex, error: `No property at postcode ${normalisedPostcode}` })
        continue
      }
      if (list.length > 1) {
        rowErrors.push({
          rowIndex,
          error: `${list.length} properties at postcode ${normalisedPostcode} — use property_id instead`,
        })
        continue
      }
      propertyId = list[0]?.id ?? null
    }
    if (!propertyId) continue

    // 2. MEES gate.
    const { data: propRow } = await sb
      .from('properties')
      .select('epc_rating, epc_expiry, organisation_id')
      .eq('id', propertyId)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .maybeSingle<{
        epc_rating: string | null
        epc_expiry: string | null
        organisation_id: string
      }>()
    if (!propRow) {
      rowErrors.push({ rowIndex, error: 'Property not accessible' })
      continue
    }
    if (
      meesStatus(propRow.epc_rating === null ? null : (propRow.epc_rating as EpcBand), propRow.epc_expiry) ===
      'let_blocked'
    ) {
      rowErrors.push({
        rowIndex,
        error: 'Property is MEES let-blocked (EPC F/G) — cannot let',
      })
      continue
    }

    // 3. Resolve unit (optional, by label per-property).
    let unitId: string | null = null
    if (row.unitLabel) {
      const { data: units } = await sb
        .from('units')
        .select('id')
        .eq('property_id', propertyId)
        .eq('organisation_id', auth.organisationId)
        .eq('label', row.unitLabel)
        .is('deleted_at', null)
        .limit(1)
      const unitList = (units ?? []) as Array<{ id: string }>
      if (unitList.length === 0) {
        rowErrors.push({
          rowIndex,
          error: `Unit "${row.unitLabel}" not found on this property`,
        })
        continue
      }
      unitId = unitList[0]?.id ?? null
    }

    // 4. Tenant — for AST/licence/company_let.
    const needsTenant = row.kind === 'ast' || row.kind === 'licence' || row.kind === 'company_let'
    let tenantId: string | null = null
    if (needsTenant) {
      if (!row.tenantFirstName || !row.tenantLastName) {
        rowErrors.push({
          rowIndex,
          error: 'Tenant first name + last name required for this kind',
        })
        continue
      }
      const { data: tenantRow, error: tenantErr } = await sb
        .from('tenants')
        .insert({
          organisation_id: auth.organisationId,
          first_name: row.tenantFirstName,
          last_name: row.tenantLastName,
          email: row.tenantEmail,
        })
        .select('id')
        .single<{ id: string }>()
      if (tenantErr || !tenantRow) {
        rowErrors.push({ rowIndex, error: `Tenant insert: ${tenantErr?.message ?? 'no row'}` })
        continue
      }
      tenantId = tenantRow.id
    }

    // 5. Tenancy insert.
    const { data: tenancyRow, error: tenancyErr } = await sb
      .from('tenancies')
      .insert({
        organisation_id: auth.organisationId,
        property_id: propertyId,
        unit_id: unitId,
        tenant_id: tenantId,
        kind: row.kind,
        start_date: toIso(row.startDate),
        end_date_intended: row.endDateIntended ? toIso(row.endDateIntended) : null,
        rent_pence: row.rentPence.toString(),
        rent_period: row.rentPeriod,
        status: 'active',
        notes: row.notes ?? null,
      })
      .select('id')
      .single<{ id: string }>()
    if (tenancyErr || !tenancyRow) {
      rowErrors.push({ rowIndex, error: `Tenancy insert: ${tenancyErr?.message ?? 'no row'}` })
      continue
    }

    // 6. Seed rent_changes.
    await sb.from('rent_changes').insert({
      organisation_id: auth.organisationId,
      tenancy_id: tenancyRow.id,
      effective_from: toIso(row.startDate),
      new_rent_pence: row.rentPence.toString(),
      new_rent_period: row.rentPeriod,
      reason: 'initial',
    })

    // 7. Mark unit occupied if assigned.
    if (unitId) {
      await sb
        .from('units')
        .update({ status: 'occupied', updated_at: new Date().toISOString() })
        .eq('id', unitId)
    }

    inserted++
  }

  revalidatePath('/tenancies')
  return { ok: true, data: { inserted, rowErrors } }
}
