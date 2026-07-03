// app/(app)/actions.ts — shared server actions for the authenticated app shell.
'use server'

import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/db/user'

export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/login')
}
