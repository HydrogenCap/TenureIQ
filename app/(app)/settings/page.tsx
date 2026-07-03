// app/(app)/settings/page.tsx
// Settings index — cards linking to each settings area.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const SECTIONS = [
  {
    href: '/settings/members',
    title: 'Team members',
    description: 'Invite people to your organisation, manage roles, and revoke access.',
  },
  {
    href: '/settings/notifications',
    title: 'Notifications',
    description: 'Choose which reminder emails you receive from TenureIQ.',
  },
  {
    href: '/settings/billing',
    title: 'Billing',
    description: 'Manage your subscription, plan, and payment details.',
  },
] as const

export default async function SettingsPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Organisation and account settings." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-accent/50">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
