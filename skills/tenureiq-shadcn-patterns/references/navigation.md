# Navigation Chrome

The app shell: sidebar + topbar + breadcrumbs. Lives in `app/(app)/layout.tsx` and a few shared components.

## App layout

```tsx
// app/(app)/layout.tsx
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data: org } = await sb
    .from('organisations')
    .select('id, name, slug')
    .eq('id', auth.organisationId)
    .single()

  // For org-switcher menu
  const { data: memberships } = await sb
    .from('organisation_members')
    .select('organisation:organisations(id, name, slug)')
    .eq('user_id', auth.userId)
    .not('accepted_at', 'is', null)
    .is('deleted_at', null)

  const otherOrgs = (memberships ?? [])
    .map((m) => Array.isArray(m.organisation) ? m.organisation[0] : m.organisation)
    .filter((o): o is { id: string; name: string; slug: string } => !!o && o.id !== auth.organisationId)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar org={org} otherOrgs={otherOrgs} userRole={auth.role} />
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
```

## Sidebar

```tsx
// components/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Building2, Users, FileText, CreditCard,
  ShieldCheck, Wrench, FolderOpen, Briefcase, ChartLine,
  Home,
} from 'lucide-react'

const NAV_SECTIONS = [
  {
    label: 'Portfolio',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/properties', label: 'Properties', icon: Building2 },
      { href: '/entities', label: 'Entities', icon: Briefcase },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/tenancies', label: 'Tenancies', icon: Users },
      { href: '/compliance', label: 'Compliance', icon: ShieldCheck },
      { href: '/maintenance', label: 'Maintenance', icon: Wrench },
      { href: '/documents', label: 'Documents', icon: FolderOpen },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/mortgages', label: 'Mortgages', icon: Home },
      { href: '/transactions', label: 'Transactions', icon: CreditCard },
      { href: '/reports', label: 'Reports', icon: FileText },
      { href: '/investors', label: 'Investors', icon: ChartLine },
    ],
  },
] as const

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex w-60 flex-col border-r bg-card">
      <div className="p-4 border-b">
        <Link href="/dashboard" className="text-lg font-semibold">
          TenureIQ
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-2 mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
```

## Topbar with org switcher

```tsx
// components/topbar.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, LogOut, Settings, User } from 'lucide-react'
import { switchOrganisation, signOut } from './topbar-actions'

export function Topbar({
  org,
  otherOrgs,
  userRole,
}: {
  org: { name: string; slug: string } | null
  otherOrgs: { id: string; name: string; slug: string }[]
  userRole: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const switchOrg = (orgId: string) => {
    startTransition(async () => {
      await switchOrganisation(orgId)
      router.refresh()
    })
  }

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1">
            <span className="font-medium">{org?.name ?? 'No organisation'}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Current ({userRole})
          </DropdownMenuLabel>
          <DropdownMenuItem disabled>{org?.name}</DropdownMenuItem>
          {otherOrgs.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Switch to
              </DropdownMenuLabel>
              {otherOrgs.map((o) => (
                <DropdownMenuItem key={o.id} onClick={() => switchOrg(o.id)}>
                  {o.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/settings/organisation')}>
            <Settings className="h-4 w-4 mr-2" /> Organisation settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <User className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push('/settings/profile')}>
            <User className="h-4 w-4 mr-2" /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
```

## Switch organisation action

```ts
// components/topbar-actions.ts
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/db/user'

export async function switchOrganisation(organisationId: string) {
  // Verify membership before switching — security boundary
  const sb = await supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await sb
    .from('organisation_members')
    .select('id, accepted_at')
    .eq('user_id', user.id)
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!member?.accepted_at) {
    throw new Error('Not a member of that organisation')
  }

  const cookieStore = await cookies()
  cookieStore.set('tenureiq_org', organisationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}

export async function signOut() {
  const sb = await supabaseServer()
  await sb.auth.signOut()
  redirect('/login')
}
```

## Breadcrumbs

Optional, used on deep pages (e.g. `Property > Compliance > Gas safety certificate`):

```tsx
// components/breadcrumbs.tsx
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground">{item.label}</Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
```

Use sparingly — the sidebar + page title is enough nav for most pages.

## Mobile

The sidebar hides on mobile via `hidden md:flex`. Replace with a drawer:

```tsx
// In topbar, add for mobile:
<Sheet>
  <SheetTrigger asChild className="md:hidden">
    <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
  </SheetTrigger>
  <SheetContent side="left" className="p-0 w-60">
    {/* render same nav structure */}
  </SheetContent>
</Sheet>
```

## Anti-patterns

1. Active link detection by exact path equality — use `startsWith` so child routes highlight the parent.
2. Sidebar items hardcoded in multiple files — one `NAV_SECTIONS` constant.
3. Org-switch without verifying membership server-side — security hole.
4. Top-nav with too many items — 6+ items on a top bar fails on mobile.
5. Breadcrumbs as the only nav — they're an aid, not a primary navigation.
