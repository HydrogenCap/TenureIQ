# AGENTS.md

This file is the open-standard guardrails for any AI coding agent (Codex CLI, Cursor, Aider, Jules). For Claude Code-specific config see `CLAUDE.md`.

## Project: TenureIQ

UK property portfolio management SaaS. Next.js 15 + TypeScript strict + Supabase + Prisma + Tailwind v4 + shadcn/ui.

## Non-negotiables (apply on every change)

1. **Money values are `bigint` pence.** Column names end `_pence`. No floats for currency.
2. **Interest rates are `int` basis points.** Column names end `_bps`. 5.25% = 525.
3. **Calendar dates are SQL `date`.** Use `timestamptz` for timestamps only.
4. **Every domain table has `organisation_id` + RLS.** Apply the four-policy template (select/insert/update/delete) from `docs/rls-pattern.md`.
5. **Service-role Supabase client is restricted** to `lib/jobs/`, `lib/admin/`, `lib/cron/`, `app/api/webhooks/`. Everywhere else uses `supabaseServer()` from `lib/db/user.ts`, which preserves RLS via the user's session.
6. **`import 'server-only'`** on any module that touches the service role, the env, or secrets.
7. **Zod schemas in `lib/schemas/<resource>.ts`** are the single source of truth. Form, server action, route handler, CSV importer all import the same schema.
8. **Server actions return `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: ... }`.** Never throw.
9. **TypeScript strict + `noUncheckedIndexedAccess`.** No `any`, no `as unknown as`, no `@ts-ignore`. Wrap untyped libraries in typed adapters under `lib/adapters/`.
10. **Soft delete via `deleted_at timestamptz null`.** All reads filter `is('deleted_at', null)` AND the RLS policy enforces it.

## UK domain rules to respect

- **Multiple Dwellings Relief was abolished June 2024 — do not implement.**
- **Clearsprings AASC rate ceiling is LHA Shared Accommodation Rate + 40%.** Many casual writeups get this wrong.
- **MEES**: EPC E minimum to let; F/G is a hard letting blocker. Surface as `LET_BLOCKED`.
- **Mandatory HMO licence**: 5+ unrelated persons forming 2+ households.
- **Section 24**: individual landlords cannot deduct mortgage interest; they receive a 20% credit. Companies are unaffected. P&L logic must differentiate.
- **SDLT 6+ dwellings**: a transaction of 6+ residential dwellings can be elected as non-residential — usually a large saving. Surface comparison on property purchases of 6+.
- **Article 4 Direction**: removes permitted-development for C3→C4. Stored at property level, never inferred.

Deeper detail in `docs/uk-property-domain.md` (or the `tenureiq-domain` skill if using Claude Code).

## Conventions

- File layout:
  ```
  app/                  # Next.js App Router (RSC by default)
    (auth)/             # auth-related routes group
    (app)/              # authenticated app routes group
      <resource>/
        page.tsx        # list
        [id]/page.tsx   # detail
        new/page.tsx    # create
        actions.ts      # server actions
        _components/    # private components
  lib/
    db/                 # user.ts (supabase), admin.ts (service role), prisma.ts
    auth/               # requireOrgMember, requireOrgRole
    domain/             # pure functions: equity, ltv, icr, sdlt, mees, hmo, aasc, lha, section24
    schemas/            # Zod schemas per resource
    jobs/               # cron, background — can use service role
    adapters/           # typed wrappers around untyped libraries
  components/
    ui/                 # shadcn/ui primitives
  prisma/
    schema.prisma
  supabase/
    migrations/         # handcrafted SQL for RLS, triggers, helpers
  tests/
    unit/
    integration/
    e2e/
  ```

- Conventional commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`.
- One feature per branch, PRs under ~500 LOC where possible.

## Build sequence (milestones)

M0 scaffold → M1 auth+RLS → M2 properties+entities → M3 units+tenancies → M4 mortgages+valuations+domain → M5 transactions+entity P&L → M6 compliance+cron → M7 documents+OCR → M8 maintenance → M9 AASC → M10 reports → M11 investor reporting → M12 polish.

See `docs/milestones.md` for definitions of done.

## CI gates (must pass before merge)

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --coverage` (≥80% on `lib/domain/`)
- `pnpm test:integration` (RLS isolation suite)
- `pnpm test:e2e` (tenant isolation, critical journeys)
- `pnpm build`
- Supabase migration drift check
- No commits to `main` directly — PRs only.

## What never to do

- Use `Decimal`, `numeric`, or `float` for money.
- Import the service role client outside `lib/jobs/`, `lib/admin/`, `lib/cron/`, `app/api/webhooks/`.
- Skip the RLS migration on a new tenant-scoped table.
- Hard delete domain rows (soft delete only).
- Add `// @ts-ignore` or `as any` (fix the type instead).
- Store asylum service user identities (AASC placements track counts, not names).
- Assume Clearsprings pays ≤ LHA SAR (correct ceiling is SAR + 40%).
- Implement Multiple Dwellings Relief.

## Empty-state behaviour

When the agent finds something genuinely ambiguous in a brief:
1. Leave a `// TODO(decision): <one line summary>` comment in the relevant file.
2. Continue with the most defensible interpretation.
3. Note the decision in the PR description so a human can override.

Do not invent business rules. Do not assume.
