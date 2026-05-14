# CLAUDE.md — TenureIQ

This file is read by Claude Code at session start. It is the operating manual.

## What you're building

**TenureIQ** — a UK property portfolio management SaaS for HMO landlords, AASC accommodation providers, and small property investment groups. Positioned against Coho (HMO operations) with added portfolio-finance features: entities, mortgages, valuations, refinance modelling, investor reporting, AASC workflow.

## Skills you must load before working

Two project skills live in `.claude/skills/` (or wherever your skills root is configured):

- **tenureiq-domain** — UK property domain knowledge (AASC, HMO, MEES, SDLT, LHA, Section 24, ICR, etc). Load on any code touching property, finance, or compliance logic.
- **tenureiq-conventions** — engineering rules (money in pence, RLS at DB, Prisma/supabase-js split, server-only modules, audit log, soft delete, Zod schemas, no `any`). Load on any code change.

These exist because the previous TenureIQ build had 49 review findings and 15 P0 security issues. The skills encode the lessons.

## Tech stack (locked)

- Next.js 15 (App Router, Server Actions, RSC by default)
- TypeScript strict, `noUncheckedIndexedAccess: true`
- Tailwind v4 + shadcn/ui (New York, neutral base)
- Supabase Postgres + Auth + Storage
- Prisma (schema source of truth, admin/job queries)
- `@supabase/ssr` (user-facing queries — RLS-enforced)
- React Hook Form + Zod + `@hookform/resolvers`
- Recharts
- `@react-pdf/renderer` (server-side PDFs)
- Papaparse (CSV import)
- Vitest + Playwright
- pnpm, Node 22 LTS

## Architectural non-negotiables (full detail in tenureiq-conventions skill)

1. **Multi-tenancy at the DB** — RLS, not application filtering.
2. **No raw SQL in route handlers** — go through `lib/db/`.
3. **`import 'server-only'`** on anything secret-touching.
4. **Service role key never in client bundle** — restricted to `lib/jobs/`, `lib/admin/`, `lib/cron/`, `app/api/webhooks/`.
5. **Money in pence (`bigint`), rates in bps (`int`), dates as `date`**.
6. **Soft delete everywhere** (`deleted_at` + RLS predicate).
7. **Audit log triggers** on properties, mortgages, valuations, tenancies, transactions, entities, compliance_items.
8. **Zod schemas shared** form ↔ action ↔ route ↔ CSV importer.
9. **No `any`, no `as unknown as`, no `@ts-ignore`**.
10. **Server actions return discriminated `ActionResult<T>`, never throw**.

## Workflow rules

- One feature per branch.
- Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- PRs under ~500 LOC where possible.
- Definition of done per milestone (in `docs/milestones.md`).
- Before any commit: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass.

## Hooks (enforced gates)

Three pre-write hooks run automatically:

- `.claude/hooks/pre-write-pence-check.sh` — blocks money columns/variables without `_pence` suffix.
- `.claude/hooks/pre-write-service-role-check.sh` — blocks service role imports outside allowed paths.
- `.claude/hooks/pre-write-any-check.sh` — blocks `: any` and `as unknown as`.

If a hook blocks you, fix the violation rather than disabling the hook. The hooks are intentionally noisy.

## Milestones (see `docs/milestones.md` for full DoD)

- **M0** Scaffold — repo, CI, Sentry, env schema.
- **M1** Auth + multi-tenancy + RLS — the riskiest milestone.
- **M2** Properties + entities CRUD with CSV import.
- **M3** Units + tenancies (AST and AASC).
- **M4** Mortgages + valuations + domain calcs (equity, LTV, ICR, stressed-LTV).
- **M5** Transactions + entity P&L + director loan ledger.
- **M6** Compliance with cron reminders.
- **M7** Documents + OCR auto-extraction.
- **M8** Maintenance kanban.
- **M9** AASC module — area lookup, placements, contracts.
- **M10** Reports (seven PDFs).
- **M11** Investor reporting (capital accounts, distributions).
- **M12** Polish + launch.

Build in order. Each milestone is one or more PRs.

## When you're stuck

1. Read the relevant skill reference (`tenureiq-domain/references/*.md` or `tenureiq-conventions/references/*.md`).
2. Check `docs/decisions/` for past architectural decisions.
3. If genuinely ambiguous, leave a `// TODO(decision): <one line>` and continue rather than guessing.
4. Never silently disable a hook, lint rule, or test.

## What never to do

- Implement Multiple Dwellings Relief (abolished June 2024).
- Assume Clearsprings pays at or below LHA SAR (it's SAR + 40%).
- Mark an EPC F or G property as lettable.
- Store asylum service user names in the database.
- Bypass RLS with `supabaseService()` outside `lib/jobs/`, `lib/admin/`, `lib/cron/`, `app/api/webhooks/`.
- Use floats for currency or rates.
- Cascade-delete tenant data on org deletion.
