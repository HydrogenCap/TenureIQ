// lib/jobs/commit-bank-import-tx.ts
// Thin service-role wrapper around commit_bank_import_rpc — copies
// approved staged rows into `transactions` in a single transaction
// with `FOR UPDATE` on the parent import to serialise concurrent
// commits.

import 'server-only'
import { supabaseService } from '@/lib/db/admin'

export type CommitBankImportResult =
  | { ok: true; inserted: number }
  | { ok: false; error: string }

export async function commitBankImportTx(input: {
  organisationId: string
  importId: string
}): Promise<CommitBankImportResult> {
  const sb = supabaseService()
  const { data, error } = await sb.rpc('commit_bank_import_rpc', {
    p_organisation_id: input.organisationId,
    p_import_id: input.importId,
  })
  if (error) return { ok: false, error: error.message }
  const count = typeof data === 'number' ? data : 0
  return { ok: true, inserted: count }
}
