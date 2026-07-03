// components/app-nav.tsx — top navigation for the authenticated app shell.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/properties', label: 'Properties' },
  { href: '/entities', label: 'Entities' },
  { href: '/tenancies', label: 'Tenancies' },
  { href: '/mortgages', label: 'Mortgages' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/bank-accounts', label: 'Bank accounts' },
  { href: '/compliance', label: 'Compliance' },
  { href: '/maintenance', label: 'Maintenance' },
  { href: '/documents', label: 'Documents' },
  { href: '/aasc', label: 'AASC' },
  { href: '/investors', label: 'Investors' },
  { href: '/portfolio-statement', label: 'Portfolio statement' },
  { href: '/reports', label: 'Reports' },
  { href: '/settings', label: 'Settings' },
] as const

// Viewers (read-only investors) get a trimmed nav: just the read pages
// they can meaningfully use. RLS still protects everything else — this
// is presentation, not security.
const VIEWER_HREFS: ReadonlySet<string> = new Set([
  '/dashboard',
  '/portfolio-statement',
  '/reports',
])

type NavRole = 'owner' | 'admin' | 'manager' | 'accountant' | 'viewer'

export function AppNav({ role }: { role?: NavRole }) {
  const pathname = usePathname()
  const items =
    role === 'viewer' ? NAV_ITEMS.filter((i) => VIEWER_HREFS.has(i.href)) : NAV_ITEMS

  return (
    <nav aria-label="Primary" className="overflow-x-auto">
      <ul className="flex items-center gap-4 whitespace-nowrap text-sm">
        {items.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-block py-2 text-muted-foreground transition-colors hover:text-foreground',
                  active && 'font-medium text-foreground underline decoration-border underline-offset-8'
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
