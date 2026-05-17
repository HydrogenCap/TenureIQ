// app/(app)/settings/notifications/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import type { ActionResult } from '@/lib/types/action-result'

const NotificationPrefsSchema = z.object({
  notifyCompliance: z.coerce.boolean(),
  notifyMortgages: z.coerce.boolean(),
  notifyTenancies: z.coerce.boolean(),
})

export async function updateNotificationPreferences(
  input: unknown,
): Promise<ActionResult<void>> {
  const auth = await requireOrgMember()
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = NotificationPrefsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  const sb = await supabaseServer()
  const { error } = await sb
    .from('organisation_members')
    .update({
      notify_compliance: parsed.data.notifyCompliance,
      notify_mortgages: parsed.data.notifyMortgages,
      notify_tenancies: parsed.data.notifyTenancies,
    })
    .eq('organisation_id', auth.organisationId)
    .eq('user_id', auth.userId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/notifications')
  return { ok: true, data: undefined }
}
