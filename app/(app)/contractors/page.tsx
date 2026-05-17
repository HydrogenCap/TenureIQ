import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'

type DbRow = {
  id: string
  name: string
  kind: string
  contact_name: string | null
  phone: string | null
  email: string | null
  insurance_expiry: string | null
  accreditations: string[]
}

function insuranceState(expiry: string | null): 'ok' | 'expiring' | 'expired' | 'missing' {
  if (!expiry) return 'missing'
  const d = new Date(expiry)
  if (Number.isNaN(d.getTime())) return 'missing'
  const now = Date.now()
  if (d.getTime() < now) return 'expired'
  if (d.getTime() - now <= 60 * 86_400_000) return 'expiring'
  return 'ok'
}

export default async function ContractorsListPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data: raw } = await sb
    .from('contractors')
    .select('id, name, kind, contact_name, phone, email, insurance_expiry, accreditations')
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('name')

  const rows = (raw ?? []) as DbRow[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contractors"
        description="Plumbers, electricians, cleaners, gas-safe engineers. Insurance-expiry reminders fire 60/30/14/7/0/-7 days out."
        actions={
          <Link href="/contractors/new" className={buttonVariants()}>
            + New contractor
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No contractors yet"
          description="Add the people who do work on your properties."
          action={
            <Link href="/contractors/new" className={buttonVariants()}>
              + New contractor
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Insurance</TableHead>
              <TableHead>Accreditations</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const ins = insuranceState(c.insurance_expiry)
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`/contractors/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                    {c.contact_name && (
                      <p className="text-xs text-muted-foreground">{c.contact_name}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.kind} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.insurance_expiry ? (
                      <div className="flex items-center gap-1.5">
                        <DateDisplay date={c.insurance_expiry} />
                        {ins === 'expired' && (
                          <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                            expired
                          </span>
                        )}
                        {ins === 'expiring' && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                            expiring
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">— not recorded</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.accreditations.join(', ') || '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
