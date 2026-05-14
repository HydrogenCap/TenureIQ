'use server'

import { z } from 'zod'
import { supabaseServer } from '@/lib/db/user'
import { env } from '@/env'

const SendLinkSchema = z.object({
  email: z.string().email(),
})

type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

export async function sendMagicLink(input: unknown): Promise<ActionResult> {
  const parsed = SendLinkSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Invalid email' }
  }

  const sb = await supabaseServer()
  const { error } = await sb.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (error) return { ok: false, error: 'Could not send sign-in link. Try again.' }
  return { ok: true }
}
