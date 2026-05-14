# Form Page Pattern

The canonical create/edit form. Single source of truth: Zod schema in `lib/schemas/<resource>.ts`. Used by the form, server action, and any CSV import for the same resource.

## File structure

```
app/(app)/properties/new/page.tsx              # create
app/(app)/properties/[id]/edit/page.tsx        # edit
app/(app)/properties/actions.ts                # createProperty, updateProperty
app/(app)/properties/_components/
  property-form.tsx                            # the form component (client)
lib/schemas/property.ts                        # Zod schema (shared)
```

## Shared Zod schema

```ts
// lib/schemas/property.ts
import { z } from 'zod'

export const PropertyCreateSchema = z.object({
  entityId: z.string().uuid('Choose an entity'),
  addressLine1: z.string().min(1, 'Address is required').max(200),
  addressLine2: z.string().max(200).optional().or(z.literal('')),
  city: z.string().min(1, 'City is required'),
  county: z.string().optional().or(z.literal('')),
  postcode: z
    .string()
    .regex(/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, 'Enter a valid UK postcode'),
  kind: z.enum(['hmo', 'single_let', 'block', 'commercial', 'development', 'land']),
  purchasePricePence: z
    .union([z.string(), z.number(), z.bigint()])
    .transform((v) => {
      if (typeof v === 'bigint') return v
      if (typeof v === 'number') return BigInt(Math.round(v * 100))
      // String: assume pounds, convert to pence
      const n = Number(v.replace(/[£,]/g, ''))
      if (Number.isNaN(n)) throw new Error('Invalid price')
      return BigInt(Math.round(n * 100))
    }),
  purchaseDate: z.coerce.date(),
  epcRating: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']).nullable().optional(),
  epcExpiry: z.coerce.date().nullable().optional(),
  bedroomsTotal: z.coerce.number().int().min(0).optional(),
  bathroomsTotal: z.coerce.number().int().min(0).optional(),
  hmoLicenceKind: z.enum(['none', 'mandatory', 'additional', 'selective']).default('none'),
  article4Area: z.boolean().default(false),
  isAascProperty: z.boolean().default(false),
})

export type PropertyCreate = z.infer<typeof PropertyCreateSchema>

export const PropertyUpdateSchema = PropertyCreateSchema.partial()
export type PropertyUpdate = z.infer<typeof PropertyUpdateSchema>
```

## Page wrapper

```tsx
// app/(app)/properties/new/page.tsx
import { supabaseServer } from '@/lib/db/user'
import { PropertyForm } from '../_components/property-form'

export default async function NewPropertyPage() {
  const sb = await supabaseServer()
  const { data: entities } = await sb
    .from('entities')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">New property</h1>
        <p className="text-sm text-muted-foreground">Add a property to your portfolio.</p>
      </div>
      <PropertyForm entities={entities ?? []} />
    </div>
  )
}
```

## The form component

```tsx
// app/(app)/properties/_components/property-form.tsx
'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { PropertyCreateSchema, type PropertyCreate } from '@/lib/schemas/property'
import { createProperty } from '../actions'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Controller } from 'react-hook-form'

export function PropertyForm({ entities, initial }: {
  entities: { id: string; name: string }[]
  initial?: Partial<PropertyCreate>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<PropertyCreate>({
    resolver: zodResolver(PropertyCreateSchema),
    defaultValues: {
      entityId: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      county: '',
      postcode: '',
      kind: 'hmo',
      purchaseDate: new Date(),
      epcRating: null,
      epcExpiry: null,
      hmoLicenceKind: 'none',
      article4Area: false,
      isAascProperty: false,
      ...initial,
    },
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

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      <FormSection
        title="Basics"
        description="Where the property is and how it's held."
      >
        <FormField name="entityId" label="Entity" error={form.formState.errors.entityId?.message} required>
          <Controller
            name="entityId"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Choose entity..." /></SelectTrigger>
                <SelectContent>
                  {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField name="addressLine1" label="Address line 1" required error={form.formState.errors.addressLine1?.message}>
            <Input {...form.register('addressLine1')} />
          </FormField>
          <FormField name="addressLine2" label="Address line 2" error={form.formState.errors.addressLine2?.message}>
            <Input {...form.register('addressLine2')} />
          </FormField>
          <FormField name="city" label="City" required error={form.formState.errors.city?.message}>
            <Input {...form.register('city')} />
          </FormField>
          <FormField name="postcode" label="Postcode" required error={form.formState.errors.postcode?.message}>
            <Input className="uppercase" {...form.register('postcode')} />
          </FormField>
        </div>

        <FormField name="kind" label="Property kind" required error={form.formState.errors.kind?.message}>
          <Controller
            name="kind"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hmo">HMO</SelectItem>
                  <SelectItem value="single_let">Single let</SelectItem>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="land">Land</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </FormSection>

      <FormSection title="Acquisition" description="Purchase details for SDLT and cost-basis tracking.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField name="purchasePricePence" label="Purchase price" required hint="In £ — converted to pence on save." error={form.formState.errors.purchasePricePence?.message}>
            <Input type="number" step="0.01" {...form.register('purchasePricePence')} />
          </FormField>
          <FormField name="purchaseDate" label="Purchase date" required error={form.formState.errors.purchaseDate?.message}>
            <Input type="date" {...form.register('purchaseDate')} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Energy" description="EPC drives MEES compliance and lettability.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField name="epcRating" label="EPC rating" error={form.formState.errors.epcRating?.message}>
            <Controller
              name="epcRating"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value ?? 'none'} onValueChange={(v) => field.onChange(v === 'none' ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField name="epcExpiry" label="EPC expiry" error={form.formState.errors.epcExpiry?.message}>
            <Input type="date" {...form.register('epcExpiry')} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Planning & licensing">
        <FormField name="hmoLicenceKind" label="HMO licence" error={form.formState.errors.hmoLicenceKind?.message}>
          <Controller
            name="hmoLicenceKind"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not required / none</SelectItem>
                  <SelectItem value="mandatory">Mandatory (5+ persons, 2+ households)</SelectItem>
                  <SelectItem value="additional">Additional (LA-designated)</SelectItem>
                  <SelectItem value="selective">Selective (LA-designated)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <Controller
          name="article4Area"
          control={form.control}
          render={({ field }) => (
            <label className="flex items-start gap-2">
              <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-1" />
              <div>
                <p className="text-sm font-medium">Property is in an Article 4 area</p>
                <p className="text-xs text-muted-foreground">Removes permitted development for C3→C4. Planning permission required.</p>
              </div>
            </label>
          )}
        />

        <Controller
          name="isAascProperty"
          control={form.control}
          render={({ field }) => (
            <label className="flex items-start gap-2">
              <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-1" />
              <div>
                <p className="text-sm font-medium">AASC property</p>
                <p className="text-xs text-muted-foreground">Used for asylum accommodation placements (Clearsprings/Serco).</p>
              </div>
            </label>
          )}
        />
      </FormSection>

      {form.formState.errors.root && (
        <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create property'}
        </Button>
      </div>
    </form>
  )
}
```

## The two helper components

```tsx
// components/form-section.tsx
export function FormSection({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
```

```tsx
// components/form-field.tsx
import { cn } from '@/lib/utils'

export function FormField({
  name,
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  name: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
```

## Multi-step forms

For very long forms (entity creation with shareholders, AASC contract setup), prefer a multi-step pattern using URL state for the active step:

```
/entities/new?step=basics
/entities/new?step=shareholders
/entities/new?step=banking
```

Each step is its own component, validated in isolation. Final step shows summary + commit. Persist intermediate state to localStorage with a debounced sync so refresh doesn't lose progress.

Don't reach for `react-step-wizard` libraries — they add bundle and don't compose with URL state.

## Anti-patterns

1. Client-side validation only — server is the trust boundary. Always re-validate in the action.
2. Submitting raw form values to the action — go through the Zod schema both sides.
3. Using uncontrolled inputs for complex controls (Select, Checkbox) — use `Controller`.
4. Field labels nested visually but not via `htmlFor` — accessibility breaks.
5. "Save" button at the top of a tall form — bottom-right is the convention; sticky if needed.
6. Catching all form errors at root — set field-level errors when the action returns `fieldErrors`.
