# Prisma vs Supabase JS Client — When To Use Which

The single most common source of P0 security bugs in Prisma + Supabase apps is using Prisma in user-facing code paths. Prisma connects with one database role; from RLS's perspective, every Prisma query is the same caller. That means RLS policies effectively do nothing.

## The rule, stated simply

| Use case | Client |
|---|---|
| Anything called by a logged-in user (server actions, route handlers, RSC data fetches) | `supabaseServer()` |
| Admin tooling, internal dashboards | `supabaseService()` (service role) — guard with `requireOrgRole(['owner'])` |
| Background jobs, cron, OCR pipeline, Stripe webhooks | `supabaseService()` |
| Database migrations | Prisma (via `prisma migrate dev` / `prisma migrate deploy`) |
| Schema source of truth | Prisma (`schema.prisma`) |
| Type generation | Both — Prisma generates `@prisma/client` types, supabase generates database types via CLI |

## Files

```
lib/db/
├── prisma.ts        # Prisma client (admin use only)
├── user.ts          # supabaseServer() — RLS-enforced, user context
└── admin.ts         # supabaseService() — service role, RLS bypass
```

### `lib/db/user.ts`

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from '@/env'

export async function supabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component context — cookies are read-only
          }
        },
      },
    }
  )
}
```

### `lib/db/admin.ts`

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'

let _client: ReturnType<typeof createClient> | null = null

export function supabaseService() {
  if (!_client) {
    _client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _client
}
```

The `'server-only'` import causes a build error if anything in the client bundle tries to import this file.

### `lib/db/prisma.ts`

```ts
import 'server-only'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

## ESLint rule

`.eslintrc.js`:

```js
module.exports = {
  // ...
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/lib/db/admin', '**/lib/db/prisma'],
          message: 'Service-role and Prisma clients are restricted to /lib/jobs/, /lib/admin/, and /lib/cron/. Use supabaseServer() from /lib/db/user for user-facing queries to preserve RLS.',
        },
      ],
    }],
  },
  overrides: [
    {
      files: ['lib/jobs/**', 'lib/admin/**', 'lib/cron/**', 'app/api/webhooks/**', 'prisma/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
}
```

Plus a hook that double-checks at write-time (see `.claude/hooks/pre-write-service-role-check.sh`).

## Concrete example: same query, two contexts

### User-facing list page (RLS enforces tenant isolation)

```ts
// app/(app)/properties/page.tsx
import { supabaseServer } from '@/lib/db/user'

export default async function PropertiesPage() {
  const sb = await supabaseServer()
  const { data: properties } = await sb
    .from('properties')
    .select('id, address_line_1, postcode, kind, current_valuation_pence')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // RLS filters by org membership automatically.
  return <PropertyList properties={properties ?? []} />
}
```

### Background job (intentional RLS bypass, gated by file location)

```ts
// lib/jobs/compliance-reminder-cron.ts
import 'server-only'
import { supabaseService } from '@/lib/db/admin'

export async function generateComplianceReminders() {
  const sb = supabaseService()
  // Reads across all orgs by design — this is a system-level job.
  const { data: expiring } = await sb
    .from('compliance_items')
    .select('id, organisation_id, property_id, kind, expiry_date')
    .gte('expiry_date', new Date().toISOString())
    .lte('expiry_date', new Date(Date.now() + 90 * 864e5).toISOString())

  for (const item of expiring ?? []) {
    // Create per-org reminder rows — also via service client
    await sb.from('reminders').insert({ /* ... */ })
  }
}
```

## When Prisma earns its keep

Prisma is fantastic for:
- Schema design (Prisma → SQL migration is more ergonomic than handcrafting)
- Generated TS types for the whole schema
- Type-safe admin queries with complex `include` / `select` (better DX than supabase-js for nested reads)
- Migrations and seeding

Prisma is wrong for:
- Any query whose results must be filtered by RLS

Treat Prisma as a power tool you keep on the workshop wall, not as the default client. Reach for it in jobs, admin pages, and migrations. Use supabase-js everywhere else.

## Migration workflow

```bash
# 1. Edit prisma/schema.prisma
# 2. Generate migration SQL
pnpm prisma migrate dev --name add_property_documents --create-only

# 3. Open the new file in supabase/migrations or prisma/migrations
#    Add RLS policies and triggers manually (Prisma does not manage RLS).

# 4. Apply
pnpm prisma migrate dev

# 5. Generate types
pnpm prisma generate

# 6. Also regenerate supabase types for the supabase-js client
pnpm supabase gen types typescript --local > types/supabase.ts

# 7. Run the drift check in CI
pnpm prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
```

## Common mistakes (refuse to write)

1. Importing `prisma` in a route handler called by a logged-in user.
2. Adding a `prisma.<table>.findMany()` in a server action — even if "the user is the right one", RLS is bypassed.
3. Forgetting to add the matching RLS migration after creating a new Prisma model.
4. Using `auth.users` table directly instead of the mirror `public.users` table.
5. Setting the service role key in `.env.local` without `.env.local` being in `.gitignore`.
