import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { AppNav } from '@/components/app-nav'
import { CommandPalette } from '@/components/command-palette'
import { NotificationBell } from '@/components/notification-bell'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { signOut } from './actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireOrgMember()
  if (!auth.ok) {
    // Signed-in but no organisation yet -> onboarding, not the login loop.
    redirect(auth.error === 'No organisation selected' ? '/onboarding' : '/login')
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="flex items-center gap-2 font-semibold tracking-tight">
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground"
              >
                T
              </span>
              TenureIQ
            </span>
            <div className="flex items-center gap-3">
              {/* Available to every role, including viewer — results are
                  RLS/org-scoped server-side, so a viewer simply sees less. */}
              <CommandPalette />
              {/* Org id keys the client-side last-seen cursor in localStorage. */}
              <NotificationBell organisationId={auth.organisationId} />
              <ThemeToggle />
              <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                {auth.role}
              </span>
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
