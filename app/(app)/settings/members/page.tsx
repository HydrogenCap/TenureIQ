// app/(app)/settings/members/page.tsx
// Team members and invitations. Owner/admin only.

import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InviteForm } from './_components/invite-form'
import { MemberRowActions } from './_components/member-row-actions'
import { RevokeButton } from './_components/revoke-button'

type MemberRow = {
  id: string
  user_id: string
  role: string
  accepted_at: string | null
  created_at: string
  users: { email: string; display_name: string | null } | null
}

type InvitationRow = {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB')
}

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'muted' {
  if (role === 'owner') return 'default'
  if (role === 'admin') return 'secondary'
  return 'muted'
}

export default async function MembersPage() {
  const auth = await requireOrgRole(['owner', 'admin'])
  if (!auth.ok) redirect('/settings')

  const sb = await supabaseServer()

  const [{ data: rawMembers, error: membersError }, { data: rawInvitations }] = await Promise.all([
    sb
      .from('organisation_members')
      .select('id, user_id, role, accepted_at, created_at, users(email, display_name)')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .not('accepted_at', 'is', null)
      .order('created_at'),
    sb
      .from('invitations')
      .select('id, email, role, expires_at, created_at')
      .eq('organisation_id', auth.organisationId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
  ])

  if (membersError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Team members" />
        <p className="text-sm text-destructive">Failed to load members: {membersError.message}</p>
      </div>
    )
  }

  const members = (rawMembers ?? []) as unknown as MemberRow[]
  const invitations = (rawInvitations ?? []) as InvitationRow[]
  const isOwner = auth.role === 'owner'
  const now = new Date()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team members"
        description="Invite people to your organisation and manage their roles."
      />

      <InviteForm />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {isOwner && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isSelf = member.user_id === auth.userId
                // users_coworker_select (security_hardening migration) lets
                // co-members read each other's directory row.
                const name = member.users?.display_name ?? member.users?.email ?? 'Team member'
                const email = member.users?.email
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="font-medium">
                        {name}
                        {isSelf && <span className="ml-1 text-muted-foreground">(you)</span>}
                      </div>
                      {email && email !== name && (
                        <div className="text-xs text-muted-foreground">{email}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(member.role)}>{member.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {member.accepted_at ? formatDate(member.accepted_at) : '—'}
                    </TableCell>
                    {isOwner && (
                      <TableCell className="text-right">
                        <MemberRowActions
                          memberId={member.id}
                          role={member.role}
                          isSelf={isSelf}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending invitations</h2>
        {invitations.length === 0 ? (
          <EmptyState
            title="No pending invitations"
            description="Invite a team member above. They will see the invitation on their onboarding screen when they sign in."
          />
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => {
                  const expired = new Date(invitation.expires_at) < now
                  return (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium">{invitation.email}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(invitation.role)}>{invitation.role}</Badge>
                      </TableCell>
                      <TableCell>
                        {formatDate(invitation.expires_at)}{' '}
                        {expired && <Badge variant="warning">Expired</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <RevokeButton invitationId={invitation.id} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
