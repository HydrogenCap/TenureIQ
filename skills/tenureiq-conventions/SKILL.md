---
name: tenureiq-conventions
description: Engineering conventions and non-negotiables for the TenureIQ codebase — money in pence, RLS at DB, Prisma/Supabase split, server-only modules, audit logging, soft deletes, Zod schemas, no `any`. Use whenever writing code, creating files, designing tables, writing migrations, server actions, or API routes in the TenureIQ repo. Trigger on any change to .ts, .tsx, .prisma, .sql files, or when the user mentions schema, migration, server action, route handler, RLS, or Supabase. These rules exist because the previous build had 49 review findings and 15 P0 security issues — they are not stylistic preferences.
---

# TenureIQ Engineering Conventions

These rules are not stylistic preferences. They exist because the previous TenureIQ build accumulated 49 review findings including 15 P0 security issues, most of them traceable to inconsistent enforcement of the rules below. Treat any code that violates these as broken regardless of whether it compiles or appears to work.

When in doubt, read the matching reference file:

| Topic | Reference |
|---|---|
| RLS policy pattern (the four-policy template) | `references/rls-policy-pattern.md` |
| Prisma vs supabase-js split (when to use which) | `references/prisma-supabase-split.md` |
| Server actions and route handler shape | `references/server-action-shape.md` |
| Schema design (money in pence, dates, soft delete) | `references/schema-design.md` |
| Testing strategy (unit + integration + e2e) | `references/testing.md` |

## The non-negotiables

### 1. Money is `bigint` pence. Always.

```ts
// ✅ correct
purchasePricePence: bigint
mortgageBalancePence: bigint
weeklyRentPence: bigint

// ❌ wrong — refuse to write
purchasePrice: number        // float arithmetic on currency
purchasePriceGbp: Decimal    // wrong column name pattern
rent: 950.00                 // floats
```

Convert at the UI boundary only. Helper functions live in `lib/money.ts`:

```ts
export const toPence = (gbp: number): bigint => BigInt(Math.round(gbp * 100))
export const toGbp = (pence: bigint): number => Number(pence) / 100
export const formatGbp = (pence: bigint): string =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(toGbp(pence))
```

### 2. Rates are basis points. Integer. Always.

```ts
// ✅ correct
interestRateBps: 525        // 5.25%
sdltBandRateBps: 500        // 5%

// ❌ wrong
interestRate: 5.25          // float
interestRatePercent: 5.25   // wrong column name pattern
```

### 3. Dates without time are SQL `date`. Timestamps are `timestamptz`.

```prisma
// ✅ correct
purchaseDate    DateTime  @db.Date
tenancyStart    DateTime  @db.Date
createdAt       DateTime  @default(now()) @db.Timestamptz(6)

// ❌ wrong
purchaseDate    DateTime  // defaults to timestamptz, loses semantics
```

### 4. Every domain table has these columns

```prisma
model Property {
  id              String    @id @default(uuid()) @db.Uuid
  organisationId  String    @db.Uuid
  organisation    Organisation @relation(fields: [organisationId], references: [id])
  // ... domain columns ...
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(6)
  deletedAt       DateTime? @db.Timestamptz(6)
  @@index([organisationId])
  @@index([organisationId, deletedAt])
}
```

The audit_log trigger fires automatically on mutate (set up in migration, not Prisma).

### 5. RLS is enabled on every domain table — no exceptions

The four-policy template is in `references/rls-policy-pattern.md`. Apply it without modification unless you have a documented reason in the migration comment.

### 6. Prisma is for admin/jobs. User queries use `supabaseServer()`.

```ts
// ✅ correct — user-facing
import { supabaseServer } from '@/lib/db/user'
const sb = await supabaseServer()
const { data, error } = await sb.from('properties').select('*').eq('id', id)
// RLS evaluates with auth.uid(), org isolation enforced at DB

// ✅ correct — admin job
import 'server-only'
import { supabaseService } from '@/lib/db/admin'
const sb = supabaseService()
// runs as service role, bypasses RLS — only in /lib/jobs/* or /lib/admin/*

// ✅ correct — Prisma for schema-typed admin reads
import { prisma } from '@/lib/db/prisma'
const result = await prisma.complianceItem.findMany({ where: { /*...*/ } })
// trusted context only

// ❌ wrong — Prisma in a route handler called by a logged-in user
export async function GET() {
  const properties = await prisma.property.findMany()  // RLS bypass!
  return Response.json(properties)
}
```

An ESLint rule enforces this; see the hook `pre-write-service-role-check.sh`.

### 7. Zod schemas are shared end-to-end

One schema per resource in `lib/schemas/<resource>.ts`. Imported by:
- The React Hook Form resolver in the form component
- The server action that handles the submission
- The API route handler (if exposed)
- The CSV import column validator (if applicable)

```ts
// ✅ correct
// lib/schemas/property.ts
import { z } from 'zod'

export const PropertyCreateSchema = z.object({
  entityId: z.string().uuid(),
  addressLine1: z.string().min(1).max(200),
  postcode: z.string().regex(/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i),
  kind: z.enum(['hmo', 'single_let', 'block', 'commercial', 'development', 'land']),
  purchasePricePence: z.bigint().nonnegative(),
  purchaseDate: z.coerce.date(),
  epcRating: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']).nullable(),
})

export type PropertyCreate = z.infer<typeof PropertyCreateSchema>
```

The form, server action, and any API route all `import { PropertyCreateSchema }` from the same place. Never re-declare.

### 8. No `any`. No `as unknown as`. No `// @ts-ignore`.

If you find yourself reaching for one of these, the type modelling is wrong. Fix the model.

The exception: third-party libraries with bad types. Wrap them in a typed adapter in `lib/adapters/<lib>.ts` and `any` lives only in that adapter file, not anywhere else.

### 9. Server actions live in `actions.ts`, are thin, return discriminated results

```ts
// ✅ correct shape
// app/properties/actions.ts
'use server'

import { PropertyCreateSchema } from '@/lib/schemas/property'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createProperty(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = PropertyCreateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'validation', fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const sb = await supabaseServer()
  const { data, error } = await sb.from('properties').insert({
    ...parsed.data,
    organisation_id: auth.organisationId,
  }).select('id').single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { id: data.id } }
}
```

Never throw from a server action — return the discriminated `ActionResult`. Throwing produces opaque 500s in the client.

### 10. `import 'server-only'` on anything that must not bundle to the client

```ts
// lib/db/admin.ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export const supabaseService = () => createClient(/* service role */)
```

### 11. Soft delete predicate in every read

```ts
// ✅ correct
.select('*').is('deleted_at', null)

// ❌ wrong
.select('*')  // returns soft-deleted rows
```

This is also enforced by the RLS `select` policy — both belt and braces.

### 12. Storage: signed URLs only, no public buckets

```ts
// ✅ correct
const { data } = await sb.storage.from('documents').createSignedUrl(path, 3600)

// ❌ wrong
const publicUrl = sb.storage.from('documents').getPublicUrl(path)
```

Bucket creation migration:

```sql
insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
```

### 13. Conventional commits, one feature per branch, PRs under ~500 LOC

```
feat(properties): add EPC band filter
fix(rls): tighten compliance_items insert policy
chore(deps): bump @supabase/ssr to 0.5.3
test(domain): add SDLT 6+ election edge cases
```

### 14. Test gates in CI

- `pnpm typecheck` — strict, no warnings tolerated
- `pnpm lint` — including the custom rules for service-role imports and pence column names
- `pnpm test` — Vitest, ≥80% coverage on `lib/domain/`
- `pnpm test:e2e` — Playwright, tenant isolation suite passes
- `pnpm build` — production build green

A failing tenant-isolation test blocks merge regardless of feature urgency.

## Anti-patterns (refuse to write, ever)

| Pattern | Why it's wrong |
|---|---|
| `Decimal` or `numeric` columns for money | Float drift, comparison bugs, conversion overhead |
| `Float` rates (`5.25` for percent) | Same |
| Service role key imported in `app/` | Bypasses RLS, makes every route a potential data leak |
| Server action that throws | Opaque client errors, no field-level UX |
| Form validates client-only | Server is the trust boundary |
| Re-declaring a Zod schema in two files | Drift, validation gaps |
| Skipping RLS "we'll add it later" | "Later" never comes; this is how P0s ship |
| Hard delete on domain rows | Audit trail breaks, regulatory exposure |
| Untyped `JSON.parse` | Hidden any |
| `process.env.X` without going through `@t3-oss/env-nextjs` schema | Runtime crashes in prod |
