# Schema Design — Money, Dates, Soft Delete, Audit

The rules below produce a schema that is correct under concurrent writes, regulatory inspection, and any combination of plan migrations.

## Column types

| Domain | Type | Notes |
|---|---|---|
| Money | `bigint` (pence) | Column name suffixed `_pence`. No nullable money unless genuinely optional. |
| Rates | `int` (basis points) | Column name suffixed `_bps`. |
| Calendar dates | `date` | `purchase_date`, `tenancy_start`, `epc_expiry`, etc. |
| Timestamps | `timestamptz` | `created_at`, `updated_at`, `deleted_at`, audit events. |
| IDs | `uuid` | `gen_random_uuid()` default. |
| Short codes | `text` | Postcode, BRMA code, currency code. |
| Enums | Postgres `enum` or `text` with CHECK | Prefer named enums for stable values, CHECK for evolving sets. |
| JSON | `jsonb` | Never `json` — `jsonb` is canonical and indexable. |

## Column naming

- `snake_case` in the database, `camelCase` in TS (Prisma `@map` and supabase-js auto-convert).
- Money columns always end `_pence`.
- Rate columns always end `_bps`.
- Foreign keys end `_id`.
- Booleans named affirmatively: `is_active`, `has_garage`, never `not_archived`.
- Status columns end `_status` when a state machine, `_kind` when a discriminator.

## The standard row signature

Every domain table includes:

```prisma
model Property {
  id              String    @id @default(uuid()) @db.Uuid
  organisationId  String    @map("organisation_id") @db.Uuid
  organisation    Organisation @relation(fields: [organisationId], references: [id])

  // ... domain columns ...

  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt       DateTime? @map("deleted_at") @db.Timestamptz(6)

  @@map("properties")
  @@index([organisationId])
  @@index([organisationId, deletedAt])
}
```

## Soft delete

- `deleted_at timestamptz null`. When non-null, the row is soft-deleted.
- All RLS `select` policies include `and deleted_at is null`.
- All read queries also filter `.is('deleted_at', null)` (defense in depth).
- Admin pages can override by using `supabaseService()`, gated by role.

## Audit log

Single table `audit_log` records every mutation on high-value tables:

```prisma
model AuditLog {
  id           BigInt   @id @default(autoincrement())
  actorUserId  String?  @map("actor_user_id") @db.Uuid
  action       String   // 'INSERT' | 'UPDATE' | 'DELETE'
  tableName    String   @map("table_name")
  rowId        String   @map("row_id") @db.Uuid
  before       Json?
  after        Json?
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@map("audit_log")
  @@index([tableName, rowId])
  @@index([actorUserId])
  @@index([createdAt])
}
```

Triggers apply to: `properties`, `mortgages`, `valuations`, `tenancies`, `transactions`, `entities`, `compliance_items`. (See `references/rls-policy-pattern.md` for the trigger function.)

## Indexing strategy

- `(organisation_id)` on every domain table — most queries filter by org first.
- `(organisation_id, deleted_at)` for tables with frequent list queries.
- `(property_id)` on per-property children (units, tenancies, mortgages, compliance_items, maintenance_jobs).
- `(expiry_date)` on `compliance_items` for the reminder cron.
- `(fixed_end_date)` on `mortgages` for expiry reporting.
- `(posted_at)` on `transactions` for period reports.
- Unique constraints where domain demands: `(organisation_id, companies_house_number)` on entities, `(property_id, label)` on units.

## Enums

For values that genuinely never expand (kind discriminators), use Postgres enums:

```sql
create type property_kind as enum ('hmo', 'single_let', 'block', 'commercial', 'development', 'land');
create type tenancy_kind as enum ('ast', 'licence', 'aasc_placement', 'company_let', 'holiday_let');
create type aasc_contractor as enum ('clearsprings', 'serco');
```

For values that may expand (status, role), use `text` with `CHECK`:

```sql
role text not null check (role in ('owner', 'admin', 'manager', 'accountant', 'viewer'))
```

Adding a new value to a `CHECK` is one migration; adding to an enum is two (alter enum, deploy code).

## Foreign keys

- `on delete restrict` is the default. Don't cascade unless the child is genuinely owned by the parent.
- For organisation deletion: never cascade. Soft-delete the org, leave rows for audit.
- For property deletion (soft): children (units, tenancies, mortgages) remain visible but the property is hidden from lists. RLS handles this via the `deleted_at is null` predicate on properties.

## Bigint and the JSON wire format

PostgreSQL `bigint` is 64-bit. JS `number` is 53-bit. When a column value exceeds `Number.MAX_SAFE_INTEGER` (≈ £90 trillion in pence — won't happen in practice but the pattern matters), serialisation breaks.

Convention: send and receive bigints as strings on the wire.

```ts
// Server action returning data containing bigint
return { ok: true, data: { id, balancePence: balance.toString() } }

// Client side
const balance = BigInt(data.balancePence)
```

Set up a global JSON serialiser:

```ts
// lib/json.ts
declare global {
  interface BigInt { toJSON(): string }
}
;(BigInt.prototype as any).toJSON = function () { return this.toString() }
```

Import this once in `app/layout.tsx` server code.

## Migrations

- Prisma generates the table-creation SQL.
- RLS, indexes that Prisma doesn't know about, triggers, and helper functions live in handcrafted SQL files under `supabase/migrations/<timestamp>_<name>.sql`.
- Both directories are version-controlled. CI runs `supabase db diff` to detect drift.

## Sample table (the gold standard)

```prisma
model Mortgage {
  id                    String    @id @default(uuid()) @db.Uuid
  organisationId        String    @map("organisation_id") @db.Uuid
  propertyId            String    @map("property_id") @db.Uuid

  lender                String
  accountRef            String?   @map("account_ref")
  originalLoanPence     BigInt    @map("original_loan_pence")
  currentBalancePence   BigInt    @map("current_balance_pence")
  interestRateBps       Int       @map("interest_rate_bps")
  monthlyPaymentPence   BigInt    @map("monthly_payment_pence")
  product               String    // check constraint at SQL level
  fixedEndDate          DateTime? @map("fixed_end_date") @db.Date
  termMonths            Int       @map("term_months")
  isInterestOnly        Boolean   @default(false) @map("is_interest_only")
  broker                String?
  notes                 String?

  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt             DateTime? @map("deleted_at") @db.Timestamptz(6)

  organisation          Organisation @relation(fields: [organisationId], references: [id])
  property              Property @relation(fields: [propertyId], references: [id])
  events                MortgageEvent[]

  @@map("mortgages")
  @@index([organisationId])
  @@index([organisationId, deletedAt])
  @@index([propertyId])
  @@index([fixedEndDate])
}
```

## Anti-patterns (refuse to write)

1. `Decimal` or `numeric` columns for money.
2. `Float` columns for rates.
3. `DateTime` (timestamptz) for what is logically a calendar date.
4. Missing `organisation_id` on a tenant-scoped table.
5. Missing the `(organisation_id, deleted_at)` index — every list query in the app pays for this.
6. Cascading deletes on tenant-data tables.
7. Storing currency codes as `integer` (the canonical ISO 4217 codes are 3-letter `text`).
8. Storing booleans as `int` or `text`.
9. JSONB columns with no schema validation — at minimum, document the expected shape in a comment.
10. Naming columns ambiguously: `amount` instead of `amount_pence`, `rate` instead of `rate_bps`, `date` instead of `<purpose>_date`.
