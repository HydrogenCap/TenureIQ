'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  InvitationCreateSchema,
  ROLES,
  ROLE_LABELS,
  type InvitationCreate,
} from '@/lib/schemas/invitation'
import { inviteMember } from '../actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/form-field'

export function InviteForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)

  const form = useForm<InvitationCreate>({
    resolver: zodResolver(InvitationCreateSchema),
    defaultValues: { email: '', role: 'viewer' },
  })

  const errors = form.formState.errors

  const onSubmit = (data: InvitationCreate) => {
    setSuccess(false)
    startTransition(async () => {
      const result = await inviteMember(data)
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            const first = msgs?.[0]
            if (first) form.setError(field as keyof InvitationCreate, { message: first })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      form.reset()
      setSuccess(true)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a team member</CardTitle>
        <CardDescription>
          Invitations expire after 7 days. No email is sent yet — the invitee will see the
          invitation on their onboarding screen when they sign in at TenureIQ.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>
                Invitation created. Ask them to sign in at TenureIQ and it will appear on their
                onboarding screen.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <FormField label="Email" required error={errors.email?.message} htmlFor="invite-email">
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@example.com"
                  {...form.register('email')}
                />
              </FormField>
            </div>
            <div className="sm:w-44">
              <FormField label="Role" required error={errors.role?.message} htmlFor="invite-role">
                <Select id="invite-role" {...form.register('role')}>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? 'Inviting…' : 'Send invitation'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
