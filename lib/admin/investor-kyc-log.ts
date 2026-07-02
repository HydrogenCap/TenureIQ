// lib/admin/investor-kyc-log.ts
//
// Service-role helper to record a KYC field read on the
// investor_kyc_log table. The table has RLS enabled + SELECT-for-
// owner/admin only; INSERT must go through this allowed path
// (per the pre-write-service-role-check hook).

import 'server-only'

import { supabaseService } from '@/lib/db/admin'

export async function logKycAccess(input: {
  organisationId: string
  investorId: string
  actorUserId: string
  accessedField: string
}): Promise<void> {
  const sb = supabaseService()
  const { error } = await sb.from('investor_kyc_log').insert({
    organisation_id: input.organisationId,
    investor_id: input.investorId,
    actor_user_id: input.actorUserId,
    accessed_field: input.accessedField,
  })
  if (error) {
    console.error('investor-kyc-log: insert failed', error)
  }
}
