// app/(app)/investors/[id]/page.tsx — investor detail.
//
// KYC fields (tax_id, date_of_birth, national_id_kind) are returned by
// RLS for any org member, but the page redacts them for non-admin
// roles and writes an investor_kyc_log row on every admin/owner read.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { logKycAccess } from '@/lib/admin/investor-kyc-log'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { MoneyDisplay } from '@/components/money-display'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { InvitePortalButton } from './_components/invite-portal-button'

type DbRow = {
  id: string
  name: string
  kind: string
  contact_email: string | null
  contact_phone: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  postcode: string | null
  country: string | null
  tax_id: string | null
  date_of_birth: string | null
  national_id_kind: string | null
  notes: string | null
  deleted_at: string | null
}

type AccountRow = {
  id: string
  kind: string
  status: string
  commitment_pence: string | number
  start_date: string
  end_date: string | null
  entity: Array<{ name: string }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function InvestorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const [invRes, accountsRes] = await Promise.all([
    sb
      .from('investors')
      .select(
        'id, name, kind, contact_email, contact_phone, address_line_1, address_line_2, city, postcode, country, tax_id, date_of_birth, national_id_kind, notes, deleted_at',
      )
      .eq('id', id)
      .eq('organisation_id', auth.organisationId)
      .maybeSingle<DbRow>(),
    sb
      .from('investor_capital_accounts')
      .select('id, kind, status, commitment_pence, start_date, end_date, entity:entities(name)')
      .eq('investor_id', id)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('start_date', { ascending: false }),
  ])

  const inv = invRes.data
  if (!inv) notFound()
  const accounts = (accountsRes.data ?? []) as AccountRow[]

  const isAdmin = auth.role === 'owner' || auth.role === 'admin'

  // Log KYC reads on every owner/admin detail-page render. Includes
  // `national_id_kind` in the gate now — revealing whether an
  // investor is identified by NI vs passport vs UTR is itself KYC
  // material. Per the security review: deduplication-by-session is
  // a follow-up (would need a session cookie marker).
  if (isAdmin && (inv.tax_id || inv.date_of_birth || inv.national_id_kind)) {
    void logKycAccess({
      organisationId: auth.organisationId,
      investorId: inv.id,
      actorUserId: auth.userId,
      accessedField: 'detail_page',
    })
  }

  // Belt-and-braces: strip raw KYC fields from the object that gets
  // serialised in the RSC payload. The flight transport sends the
  // pre-render data over the wire — relying on the JSX conditional
  // alone leaves the raw values reachable in the response. For
  // non-admin roles, blank them at the data layer.
  const safeInv = isAdmin
    ? inv
    : { ...inv, tax_id: null, date_of_birth: null, national_id_kind: null }

  return (
    <div className="space-y-6">
      <PageHeader
        title={inv.name}
        description={`${inv.kind} · ${inv.contact_email ?? 'no email'}`}
        actions={
          <>
            <Link
              href="/investors"
              className="self-center text-sm font-medium text-muted-foreground hover:underline"
            >
              ← Investors
            </Link>
            <Link
              href={`/investors/accounts/new?investorId=${inv.id}`}
              className={buttonVariants()}
            >
              + Open account
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={inv.kind} />
        {inv.deleted_at && <StatusBadge status="cancelled" />}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-base font-medium">Contact</h3>
          <dl className="space-y-1.5 text-sm">
            <Row label="Email" rowValue={inv.contact_email} />
            <Row label="Phone" rowValue={inv.contact_phone} />
            <Row
              label="Address"
              rowValue={
                [inv.address_line_1, inv.address_line_2, inv.city, inv.postcode, inv.country]
                  .filter(Boolean)
                  .join(', ') || null
              }
            />
          </dl>
          {isAdmin && inv.contact_email && (
            <div className="mt-3">
              {/* Portal invite = viewer-role org membership. Only
                  owner/admin can create invitations (the action enforces
                  it), so the affordance is hidden from other roles. */}
              <InvitePortalButton investorId={inv.id} email={inv.contact_email} />
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-base font-medium">
            KYC{' '}
            <span className="text-xs font-normal text-muted-foreground">
              {isAdmin ? '(admin view — logged)' : '(redacted)'}
            </span>
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Row
              label="Tax ID"
              rowValue={
                safeInv.tax_id
                  ? isAdmin
                    ? safeInv.tax_id
                    : `*****${safeInv.tax_id.slice(-3)}`
                  : null
              }
            />
            <Row
              label="ID kind"
              rowValue={isAdmin ? safeInv.national_id_kind : safeInv.national_id_kind ? 'redacted' : null}
            />
            <Row
              label="Date of birth"
              rowValue={
                safeInv.date_of_birth
                  ? isAdmin
                    ? <DateDisplay date={safeInv.date_of_birth} />
                    : 'redacted'
                  : null
              }
            />
          </dl>
        </section>
      </div>

      <section>
        <h3 className="mb-2 text-base font-medium">Accounts ({accounts.length})</h3>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts opened yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Commitment</TableHead>
                <TableHead>Start</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.entity?.[0]?.name ?? '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={a.kind} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toBig(a.commitment_pence)} />
                  </TableCell>
                  <TableCell className="text-sm">
                    <DateDisplay date={a.start_date} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/investors/accounts/${a.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {inv.notes && (
        <section>
          <h3 className="mb-2 text-base font-medium">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{inv.notes}</p>
        </section>
      )}
    </div>
  )
}

function Row({
  label,
  rowValue,
}: {
  label: string
  rowValue: React.ReactNode
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{rowValue ?? '—'}</dd>
    </div>
  )
}
