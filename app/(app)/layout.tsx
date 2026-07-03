import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { signOut } from './actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireOrgMember()
  if (!auth.ok) {
    // Signed-in but no organisation yet -> onboarding, not the login loop.
    redirect(auth.error === 'No organisation selected' ? '/onboarding' : '/login')
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="font-semibold">TenureIQ</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Role: {auth.role}</span>
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
          <AppNav role={auth.role} />
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </div>
  )
}
