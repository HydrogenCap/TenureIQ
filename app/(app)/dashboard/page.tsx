import { supabaseServer } from '@/lib/db/user'
import { requireOrgMember } from '@/lib/auth/require'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data: org } = await sb
    .from('organisations')
    .select('name, slug')
    .eq('id', auth.organisationId)
    .single()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{org?.name ?? 'Dashboard'}</h1>
        <p className="text-sm text-muted-foreground">
          Welcome to TenureIQ. Your portfolio modules will appear here as you add data.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Properties', value: '—' },
          { label: 'Portfolio value', value: '—' },
          { label: 'Mortgage balance', value: '—' },
          { label: 'Compliance attention', value: '—' },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold">{tile.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
