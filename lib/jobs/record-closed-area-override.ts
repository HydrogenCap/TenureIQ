// lib/jobs/record-closed-area-override.ts
// Writes an explicit audit_log entry when a user creates an AASC
// placement in a CLOSED contractor area with the override flag set.
// audit_log writes are normally trigger-only (RLS is select-only), so
// this goes through the service-role client — the same trusted server
// path the triggers use. No identity data ever passes through here.

import 'server-only'
import { supabaseService } from '@/lib/db/admin'

export type ClosedAreaOverrideAudit = {
  actorUserId: string
  organisationId: string
  placementId: string
  contractor: string
  localAuthority: string
  areaStatus: string
  placementRef: string
}

export async function recordClosedAreaOverride(
  input: ClosedAreaOverrideAudit,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseService()
  const { error } = await sb.from('audit_log').insert({
    actor_user_id: input.actorUserId,
    organisation_id: input.organisationId,
    action: 'OVERRIDE',
    table_name: 'aasc_placements',
    row_id: input.placementId,
    before: null,
    after: {
      note: 'closed_area_override',
      contractor: input.contractor,
      local_authority: input.localAuthority,
      area_status: input.areaStatus,
      placement_ref: input.placementRef,
    },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
