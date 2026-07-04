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
  { href: '/arrears', label: 'Arrears' },
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
// is presentation, not security. Arrears is deliberately excluded:
// tenant-payment behaviour is operational detail, not investor reading.
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
    <nav aria-label="Primary" className="-mx-2 overflow-x-auto">
      <ul className="flex items-center gap-1 whitespace-nowrap pb-2 text-sm">
        {items.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-block rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  active && 'bg-accent font-medium text-accent-foreground'
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
