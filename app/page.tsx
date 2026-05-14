import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/db/user'

export default async function HomePage() {
  const sb = await supabaseServer()
  const { data: { user } } = await sb.auth.getUser()

  if (!user) redirect('/login')
  redirect('/dashboard')
}
