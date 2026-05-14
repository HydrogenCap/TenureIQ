'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { OrganisationCreateSchema, type OrganisationCreate } from '@/lib/schemas/organisation'
import { createOrganisation, acceptInvitation } from './actions'

type Invitation = {
  id: string
  organisation_id: string
  role: string
  organisations: { name: string } | { name: string }[] | null
}

export function OnboardingForm({ invitations }: { invitations: Invitation[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'create' | 'invitations'>(
    invitations.length > 0 ? 'invitations' : 'create'
  )

  const form = useForm<OrganisationCreate>({
    resolver: zodResolver(OrganisationCreateSchema),
    defaultValues: { name: '', slug: '' },
  })

  const onCreate = (values: OrganisationCreate) => {
    startTransition(async () => {
      const result = await createOrganisation(values)
      if (!result.ok) {
        form.setError('root', { message: result.error })
        return
      }
      router.push('/dashboard')
    })
  }

  const onAccept = (invitationId: string) => {
    startTransition(async () => {
      const result = await acceptInvitation({ invitationId })
      if (!result.ok) return alert(result.error)
      router.push('/dashboard')
    })
  }

  return (
    <div className="space-y-6">
      {invitations.length > 0 && (
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setMode('invitations')}
            className={`rounded-md px-3 py-1 ${
              mode === 'invitations' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
            }`}
          >
            Pending invitations ({invitations.length})
          </button>
          <button
            onClick={() => setMode('create')}
            className={`rounded-md px-3 py-1 ${
              mode === 'create' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
            }`}
          >
            Create new
          </button>
        </div>
      )}

      {mode === 'invitations' && invitations.length > 0 && (
        <div className="space-y-3">
          {invitations.map((inv) => {
            const orgName = Array.isArray(inv.organisations)
              ? inv.organisations[0]?.name
              : inv.organisations?.name
            return (
              <div key={inv.id} className="rounded-md border border-border p-4 flex justify-between items-center">
                <div>
                  <p className="font-medium">{orgName ?? 'Organisation'}</p>
                  <p className="text-xs text-muted-foreground">Role: {inv.role}</p>
                </div>
                <button
                  onClick={() => onAccept(inv.id)}
                  disabled={pending}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                >
                  Accept
                </button>
              </div>
            )
          })}
        </div>
      )}

      {mode === 'create' && (
        <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Organisation name
            </label>
            <input
              id="name"
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="slug" className="text-sm font-medium">
              URL slug
            </label>
            <input
              id="slug"
              placeholder="oxygen-management"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...form.register('slug')}
            />
            {form.formState.errors.slug && (
              <p className="text-sm text-destructive">{form.formState.errors.slug.message}</p>
            )}
          </div>

          {form.formState.errors.root && (
            <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create organisation'}
          </button>
        </form>
      )}
    </div>
  )
}
