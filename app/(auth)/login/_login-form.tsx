'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { sendMagicLink } from './actions'

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type LoginInput = z.infer<typeof LoginSchema>

export function LoginForm() {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)

  const form = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = (values: LoginInput) => {
    startTransition(async () => {
      const result = await sendMagicLink(values)
      if (!result.ok) {
        form.setError('root', { message: result.error })
        return
      }
      setSent(true)
    })
  }

  if (sent) {
    return (
      <div className="rounded-md border border-border bg-card p-4">
        <p className="text-sm">
          Check your email — we've sent you a sign-in link.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          {...form.register('email')}
        />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
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
        {pending ? 'Sending…' : 'Send sign-in link'}
      </button>
    </form>
  )
}
