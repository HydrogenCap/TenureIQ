# Server Action Shape — The Pattern

Every server action in TenureIQ follows this exact shape. Drift from this and the form UX breaks.

## The pattern

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PropertyCreateSchema, type PropertyCreate } from '@/lib/schemas/property'

// Discriminated result — never throw
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createProperty(input: unknown): Promise<ActionResult<{ id: string }>> {
  // 1. Auth & RBAC
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  // 2. Validation (server-side, with the same schema the form uses)
  const parsed = PropertyCreateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  // 3. Mutation
  const sb = await supabaseServer()
  const { data, error } = await sb
    .from('properties')
    .insert({
      organisation_id: auth.organisationId,
      entity_id: parsed.data.entityId,
      address_line_1: parsed.data.addressLine1,
      postcode: parsed.data.postcode.toUpperCase(),
      kind: parsed.data.kind,
      purchase_price_pence: parsed.data.purchasePricePence.toString(),  // bigint → text for transit
      purchase_date: parsed.data.purchaseDate.toISOString().slice(0, 10),
      epc_rating: parsed.data.epcRating,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'A property with this address already exists.' }
    return { ok: false, error: error.message }
  }

  // 4. Revalidation
  revalidatePath('/properties')

  // 5. Result
  return { ok: true, data: { id: data.id } }
}
```

## The matching form

```tsx
// app/(app)/properties/_components/property-form.tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTransition } from 'react'
import { PropertyCreateSchema, type PropertyCreate } from '@/lib/schemas/property'
import { createProperty } from '../actions'
import { useRouter } from 'next/navigation'

export function PropertyForm({ entities }: { entities: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const form = useForm<PropertyCreate>({
    resolver: zodResolver(PropertyCreateSchema),
    defaultValues: { /* sensible defaults */ },
  })

  const onSubmit = (values: PropertyCreate) => {
    startTransition(async () => {
      const result = await createProperty(values)
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, errors] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof PropertyCreate, { message: errors?.[0] })
          }
        } else {
          form.setError('root', { message: result.error })
        }
        return
      }
      router.push(`/properties/${result.data.id}`)
    })
  }

  return <form onSubmit={form.handleSubmit(onSubmit)}>{/* ... fields ... */}</form>
}
```

## Auth helper

```ts
// lib/auth/require.ts
import { supabaseServer } from '@/lib/db/user'

type Role = 'owner' | 'admin' | 'manager' | 'accountant' | 'viewer'

type AuthResult =
  | { ok: true; userId: string; organisationId: string; role: Role }
  | { ok: false; error: string }

export async function requireOrgMember(): Promise<AuthResult> {
  const sb = await supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // The user's current org is the one referenced in the URL, header, or a cookie.
  // For server actions, we read from the cookie set during org-switch.
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const organisationId = cookieStore.get('tenureiq_org')?.value

  if (!organisationId) return { ok: false, error: 'No organisation context' }

  const { data: member } = await sb
    .from('organisation_members')
    .select('role, accepted_at')
    .eq('user_id', user.id)
    .eq('organisation_id', organisationId)
    .single()

  if (!member || !member.accepted_at) return { ok: false, error: 'Not a member of this organisation' }

  return { ok: true, userId: user.id, organisationId, role: member.role as Role }
}

export async function requireOrgRole(roles: Role[]): Promise<AuthResult> {
  const auth = await requireOrgMember()
  if (!auth.ok) return auth
  if (!roles.includes(auth.role)) return { ok: false, error: `Requires role: ${roles.join(' or ')}` }
  return auth
}
```

## Why these specifics matter

- **Discriminated result instead of throwing**: server-action exceptions surface as opaque 500 errors with no useful client UX. Discriminated results let the form set field-level errors precisely.
- **`safeParse`, not `parse`**: parse throws; safeParse gives you the typed error tree you need to set field-level form errors.
- **`auth.organisationId` always assigned server-side**: never trust a client-supplied `organisationId`. The RLS policy would catch the violation, but failing closed at the application layer is cheaper.
- **`revalidatePath` after mutate**: ensures the list page re-fetches when the user navigates back.
- **`'use server'` at the top of the file**: enforces all exports being server actions; mixing client functions in the same file is an error.

## Edge cases the pattern handles

1. **Network error during submission** — `useTransition` shows pending state; if the action throws (e.g. network drop), the `startTransition` catches it implicitly via `useFormState` style. For robust UX, wrap the action call in a try/catch in the form too.
2. **Duplicate row** (Postgres `23505`) — surface as a friendly message, not the raw constraint name.
3. **RLS rejection** — supabase returns a Postgres error with `42501` permission denied. Surface as "You don't have permission to perform this action." — never expose internal RBAC details.
4. **Stale CSRF** — Next.js handles this automatically; if action throws on stale origin, the form should retry once after page reload.

## What never to do

1. `revalidate: 0` or `cache: 'no-store'` in a route handler that already enforces freshness via `revalidatePath`. Pick one strategy.
2. Returning the full Supabase error object — leaks DB schema details.
3. Calling `sb.from('properties').insert({ organisation_id: input.orgId })` where `input.orgId` came from the client. Always use server-derived `auth.organisationId`.
4. Skipping the Zod safeParse "because RHF already validated" — server is the trust boundary.
5. Adding business logic to the form component — keep forms dumb, logic in actions and `lib/domain/`.
