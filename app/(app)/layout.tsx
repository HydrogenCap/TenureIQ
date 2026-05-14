import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <span className="font-semibold">TenureIQ</span>
          <span className="text-xs text-muted-foreground">Role: {auth.role}</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </div>
  )
}
