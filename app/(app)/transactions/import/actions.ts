// app/(app)/transactions/import/actions.ts
//
// Bank CSV import. Four actions:
//   - createImport: parses + stages + auto-categorises + duplicate-detects.
//   - updateStagedRow: preview-UI edits (recategorise / skip / unskip).
//   - commitImport: copies approved rows into `transactions` via the
//                   commit_bank_import_rpc service-role helper.
//   - rejectImport: soft-deletes the staging rows; status='rejected'.

'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { detectBankFormat, mapBankRow, type BankFormatId } from '@/lib/csv/bank-formats'
import { categoriseAgainstRules, type CategoryRule } from '@/lib/domain/transactions'
import { commitBankImportTx } from '@/lib/jobs/commit-bank-import-tx'
import type { ActionResult } from '@/lib/types/action-result'

const CreateImportSchema = z.object({
  bankAccountId: z.string().uuid('Choose a bank account'),
  filename: z.string().min(1).max(200),
  headers: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.string())).max(5000),
})

export type CreateImportResult = {
  importId: string
  format: BankFormatId
  rowCount: number
  duplicateCount: number
  uncategorisedCount: number
}

export async function createImport(
  input: unknown,
): Promise<ActionResult<CreateImportResult>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = CreateImportSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid import payload',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()

  const { data: bank } = await sb
    .from('bank_accounts')
    .select('id')
    .eq('id', parsed.data.bankAccountId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!bank) {
    return { ok: false, error: 'Bank account not found in your organisation.' }
  }

  const format = detectBankFormat(parsed.data.headers)

  const mapped: Array<{
    rowIndex: number
    postedAt: string
    description: string
    amountPence: bigint
    externalId: string | null
    reference: string | null
  }> = []
  parsed.data.rows.forEach((raw, i) => {
    const c = mapBankRow(format.id, raw)
    if (!c) return
    mapped.push({
      rowIndex: i,
      postedAt: c.postedAt,
      description: c.description,
      amountPence: c.amountPence,
      externalId: c.externalId,
      reference: c.reference,
    })
  })

  // Auto-categorisation rules — most-used first so frequent matches
  // stay cheap.
  type RuleRow = {
    pattern: string
    is_regex: boolean
    category_code: string
    property_id: string | null
    sign_required: string | null
  }
  const { data: ruleRows } = await sb
    .from('transaction_category_rules')
    .select('pattern, is_regex, category_code, property_id, sign_required')
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('hit_count', { ascending: false })
  const rules: CategoryRule[] = ((ruleRows ?? []) as RuleRow[]).map((r) => ({
    pattern: r.pattern,
    isRegex: r.is_regex,
    categoryCode: r.category_code,
    propertyId: r.property_id,
    signRequired:
      r.sign_required === 'credit' || r.sign_required === 'debit' ? r.sign_required : null,
  }))

  // Duplicate detection — exact match on (bank_account, posted_at,
  // amount_pence). Catches the obvious re-upload case. The pg_trgm
  // index added in the migration is reserved for the preview UI's
  // "potential fuzzy duplicates" hint.
  const minDate = mapped.reduce((lo, r) => (r.postedAt < lo ? r.postedAt : lo), '9999-12-31')
  const maxDate = mapped.reduce((hi, r) => (r.postedAt > hi ? r.postedAt : hi), '0000-01-01')
  type ExistingTx = { id: string; posted_at: string; amount_pence: string | number }
  const existingRes =
    mapped.length === 0
      ? { data: [] as ExistingTx[] }
      : await sb
          .from('transactions')
          .select('id, posted_at, amount_pence')
          .eq('organisation_id', auth.organisationId)
          .eq('bank_account_id', parsed.data.bankAccountId)
          .is('deleted_at', null)
          .gte('posted_at', minDate)
          .lte('posted_at', maxDate)
  const existingByKey = new Map<string, string>()
  for (const e of (existingRes.data ?? []) as ExistingTx[]) {
    const amountText =
      typeof e.amount_pence === 'string' ? e.amount_pence : String(Math.round(e.amount_pence))
    existingByKey.set(`${e.posted_at}::${amountText}`, e.id)
  }

  const { data: importRow, error: impErr } = await sb
    .from('transaction_imports')
    .insert({
      organisation_id: auth.organisationId,
      bank_account_id: parsed.data.bankAccountId,
      uploaded_by_user_id: auth.userId,
      filename: parsed.data.filename,
      format: format.id,
      row_count: mapped.length,
      status: 'previewing',
    })
    .select('id')
    .single<{ id: string }>()
  if (impErr) return { ok: false, error: `Import header: ${impErr.message}` }
  if (!importRow) return { ok: false, error: 'Import header returned no row' }

  let duplicateCount = 0
  let uncategorisedCount = 0

  const stageRows = mapped.map((m) => {
    const dupId = existingByKey.get(`${m.postedAt}::${m.amountPence.toString()}`) ?? null
    const cat = categoriseAgainstRules(m.description, m.amountPence, rules)
    if (dupId) duplicateCount++
    if (!cat) uncategorisedCount++
    return {
      organisation_id: auth.organisationId,
      import_id: importRow.id,
      row_index: m.rowIndex,
      posted_at: m.postedAt,
      description: m.description,
      amount_pence: m.amountPence.toString(),
      external_id: m.externalId,
      reference: m.reference,
      category_code: cat?.categoryCode ?? 'uncategorised',
      property_id: cat?.propertyId ?? null,
      status: dupId ? 'duplicate' : 'pending',
      duplicate_of_transaction_id: dupId,
    }
  })

  if (stageRows.length > 0) {
    const { error: rowsErr } = await sb.from('transaction_import_rows').insert(stageRows)
    if (rowsErr) {
      await sb
        .from('transaction_imports')
        .update({ status: 'rejected', rejected_at: new Date().toISOString() })
        .eq('id', importRow.id)
      return { ok: false, error: `Stage rows: ${rowsErr.message}` }
    }
  }

  revalidatePath('/transactions/import')
  return {
    ok: true,
    data: {
      importId: importRow.id,
      format: format.id,
      rowCount: mapped.length,
      duplicateCount,
      uncategorisedCount,
    },
  }
}

const UpdateStagedRowSchema = z.object({
  rowId: z.string().uuid(),
  categoryCode: z.string().min(1).max(60),
  propertyId: z.string().uuid().nullable(),
  skip: z.boolean(),
})

export async function updateStagedRow(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }
  const parsed = UpdateStagedRowSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const sb = await supabaseServer()
  const { error } = await sb
    .from('transaction_import_rows')
    .update({
      category_code: parsed.data.categoryCode,
      property_id: parsed.data.propertyId,
      status: parsed.data.skip ? 'skipped' : 'pending',
    })
    .eq('id', parsed.data.rowId)
    .eq('organisation_id', auth.organisationId)
    .in('status', ['pending', 'duplicate', 'skipped'])
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: undefined }
}

const ImportIdSchema = z.object({ importId: z.string().uuid() })

export async function commitImport(
  input: unknown,
): Promise<ActionResult<{ inserted: number }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }
  const parsed = ImportIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid import id' }

  const result = await commitBankImportTx({
    organisationId: auth.organisationId,
    importId: parsed.data.importId,
  })
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/transactions')
  revalidatePath('/transactions/import')
  return { ok: true, data: { inserted: result.inserted } }
}

export async function rejectImport(input: unknown): Promise<ActionResult<void>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) return { ok: false, error: auth.error }
  const parsed = ImportIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid import id' }
  const sb = await supabaseServer()
  const { error } = await sb
    .from('transaction_imports')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      deleted_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.importId)
    .eq('organisation_id', auth.organisationId)
    .in('status', ['pending', 'previewing'])
  if (error) return { ok: false, error: error.message }
  revalidatePath('/transactions/import')
  return { ok: true, data: undefined }
}
