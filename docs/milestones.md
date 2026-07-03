# TenureIQ Milestones

Each milestone is one or more PRs. Definition of Done is concrete and testable.

## M0 — Scaffold ✅ delivered in this foundation

- [x] Next.js 15 + TS strict + Tailwind v4 set up
- [x] Supabase + Prisma + `@supabase/ssr` wired in `lib/db/*`
- [x] Env validation via `@t3-oss/env-nextjs`
- [x] GitHub Actions CI: typecheck, lint, test, build
- [x] CLAUDE.md, AGENTS.md, .claude/hooks/

**DoD**: `pnpm dev` boots, `pnpm typecheck && pnpm lint && pnpm test` pass on an empty repo.

## M1 — Auth + multi-tenancy + RLS ✅ delivered in this foundation

- [x] Email magic link sign-in
- [x] Organisations table + organisation_members + invitations + RLS
- [x] `current_user_orgs()` + `current_user_orgs_with_role()` helpers
- [x] `requireOrgMember()` + `requireOrgRole()` server-side guards
- [x] Onboarding flow (create org / accept invitation)
- [x] Audit log table + trigger function
- [x] Tenant isolation Playwright spec (the must-pass gate)

**DoD**: `pnpm test:e2e tenant-isolation.spec.ts` passes against a freshly-migrated local Supabase.

## M2 — Properties + entities ✅ delivered

- [x] Entities CRUD (Ltd, LLP, individual, SPV) — list, create, detail, edit, archive, restore
- [x] Properties CRUD — list, create, detail with KPIs and tabs (Overview live; Units/Finance/Compliance/Maintenance/Documents stubbed for later milestones), edit, archive, restore
- [x] Property list with search + filters (entity, kind)
- [x] CSV import wizard for properties (papaparse → Zod row validation → preview with row-level errors → batched commit with progress)
- [x] Property KPIs domain function (`propertyKpis`) with tests
- [x] HMO licence + Article 4 + AASC flags surfaced on property detail
- [x] Bank accounts at entity level — `bank_accounts.entity_id` schema column wired through M5; entity detail page lists them under the Bank accounts tab with `?entityId=` prefill on the new-account link
- [x] Shareholders tab — Companies-House-style roster (name, share class, share count, director flag, appointed/resigned dates) with inline CRUD on the entity detail page. Distinct from M11 `investor_capital_accounts` (the HydrogenCap distribution ledger)
- [x] MEES status badge on the property list — derives `let_blocked` / `epc_expired` / `epc_missing` / `compliant` via the shared `meesStatus` helper that already gates `createTenancy`

**DoD progress**: typecheck clean; 47 unit tests pass including 5 for `propertyKpis`. Playwright tenant-isolation spec extended (entities + archived-list-hidden) and ready to execute once Supabase is running. Manual UI verification requires `pnpm dev` against a live local Supabase — not run in this bootstrap pass.

## M3 — Units + tenancies ✅ delivered (Playwright spec still needs live Supabase)

- [x] Units CRUD per property (create, edit, archive — archive refuses with an active tenancy)
- [x] Tenant directory (AST/licence/company_let names + contact + right-to-rent fields)
- [x] Tenancies CRUD with `kind` discriminator (ast, licence, company_let, holiday_let; aasc_placement reserved for M8)
- [x] Right-to-rent check/expiry tracking on tenants
- [x] Tenancy timeline view per property (CSS-grid, not Recharts — overkill for date bars)
- [x] Domain functions: monthlyRentPence/annualRentPence/weeklyRentPence with the × 52 ÷ 12 conversion (not × 4); occupancyBps; voidDays; currentTenancy
- [x] MEES enforcement: createTenancy refuses on let-blocked properties (EPC F/G no exemption)
- [x] giveNotice / endTenancy / recordRentChange actions with rent history (rent_changes seeded at start)
- [x] Joint tenants: tenancy_tenants join table + form supports up to 4 joint tenants
- [x] CSV tenancy import (Papaparse → row-level validation → batched commit with progress + per-row failures)
- [x] AASC placement tenancies — the user-facing creation flow lives in `/aasc/placements/new` per the M9 module (schema fields aasc_placement_ref, aasc_contractor are wired)
- [ ] Playwright tenancy-create + MEES-block spec (deferred — needs live Supabase to run)

**DoD progress**: typecheck clean; 73/73 unit tests pass; 20 routes compile. Migration-reviewer + security-reviewer P0/P1 findings addressed in 20260515000001_m03_security_fixes. Known follow-up: createTenancy multi-step is not transactional — supabase-js doesn't expose multi-statement transactions; cleanest fix is a Postgres RPC, queued for when several similar multi-step actions land.

## M4 — Mortgages + valuations + domain calcs ✅ delivered

- [x] Mortgages CRUD: list, create (seeds drawdown event), detail with KPIs (balance / rate / LTV / fixed-end), edit, archive
- [x] Mortgage events: drawdown, payment, payment_interest_only, rate_change, product_switch, redemption, er_charge, reconciliation — inline Record-Event form on the detail page. recordMortgageEvent re-derives `current_balance_pence` from the full ledger after every write.
- [x] setCurrentBalance manual reconciliation writes both the column and an event row.
- [x] Valuations history per property — Add Valuation inline form on the Finance tab; market-grade kinds (red_book, refinance, purchase) override the live valuation only when not older than current.
- [x] Per-property Finance tab populated (replaces M2 stub) — mortgages + valuations side-by-side.
- [x] Portfolio dashboard tiles live: count, value, debt + equity, weighted-average LTV.
- [x] Refinance window card: count of mortgages with fixed-rate end ≤180 days, deep-links to `/mortgages?fixedEndWithin=180`.
- [x] Domain: currentInterestRateBps, monthlyInterestPence, monthsUntil, daysUntilFixedEnd, deriveBalancePence, weightedAverageLtvBps, portfolioTotals — 27 new unit tests.
- [x] Stressed LTV (200bps) + ICR pass/fail KPI tiles on the Finance tab — 4-tile stress block at the top of the tab when the property has debt
- [x] Per-property weighted yield — surfaced as the Gross yield KPI on the property header, summed across active tenancies via the weeklyRentPence rollup
- [x] Transactional createMortgage via `create_mortgage_rpc` — drawdown event + mortgage row land atomically (replaces the compensating-soft-delete pattern)
- [ ] Playwright spec (create property → add mortgage → record payment → verify balance + LTV update) — deferred, needs live Supabase.

**DoD progress**: typecheck clean; 100/100 unit tests pass (was 73); 24 routes compile (was 20; +4 mortgage routes). Property KPIs now use real mortgage balance. Known follow-up: `createMortgage` drawdown-event seed is not transactional — same RPC pattern as M3 `createTenancy`, queued.

## M5 — Transactions + entity P&L + director loan ledger ✅ delivered

- [x] Transactions table with `category_code` (30-value controlled enum in `lib/domain/transactions.ts`: rent, mortgage_payment / _interest / _capital, maintenance, insurance_premium, utilities, agent_fees, professional_fees, tax_payment, investor_contribution / _distribution, director_loan_in / _out, refinance_drawdown, opening_balance, reconciliation, etc.)
- [x] Bank accounts CRUD — list, new, detail with opening balance + net movement + reconciled balance KPI tiles + last 100 transactions.
- [x] Transactions CRUD — global ledger list with filters (bank account, property, category, date range, search), new (with deep-link `?bankAccount=` / `?property=`), detail with credit/debit semantic, edit.
- [x] `transaction_category_rules` memory table — rules are seeded automatically when a user re-categorises a transaction with `createRule: true`.
- [x] `categoriseAgainstRules` domain function — substring or `/regex/flags` patterns; first-match wins; rules can scope to a sign (`credit` / `debit`). Malformed regex returns no-match (no throw).
- [x] `monthlyPandL` / `annualPandL` / `last12Months` aggregators — pure, exclude split parents to prevent double-counting; filter by property or entity. 13 unit tests including the split-parent case.
- [x] Recategorise actions: `recategoriseTransaction` (single, optionally seeds a rule) and `bulkRecategoriseTransactions` (up to 500 IDs at once).
- [x] CSV bank import wizard with Monzo / Starling / HSBC format detection + generic column-mapping fallback. Staging tables (`transaction_imports`, `transaction_import_rows`), `pg_trgm`-backed fuzzy dedup, atomic commit via `commit_bank_import_rpc`.
- [x] Reconciliation flag per transaction — `ReconcileToggle` client component on `/transactions/[id]` flips `reconciled_at` via the `setTransactionReconciled` action.
- [x] Entity P&L + Section 24 + tax estimate — `EntityPandL` now appends a tax footer that picks individual (S24, 40% marginal, 20% interest credit) or company (25% CT) based on `entities.kind`, with a Section 24 cost callout for individuals.
- [x] Director loan ledger — per-director balance roll-up, signed event entries (loan_in/out, interest_accrued, repayment) with a sign-convention guard, overdrawn warning citing s455 CTA 2010. Lives on `/entities/[id]?tab=director-loans`.
- [x] Investor capital accounts — delivered in M11.

**DoD progress**: typecheck clean; 113/113 tests pass (was 100; +13 in `transactions`); 31 routes compile (was 24; +7 in M5: 3 bank-accounts + 4 transactions). Defence-in-depth `organisation_id` predicates on every new read. RLS + audit trigger on `transaction_category_rules`. New `transactions.external_id` unique-with-bank-account for future bank-export dedup.

## M6 — Compliance + cron reminders ✅ delivered

- [x] Compliance items CRUD per property (gas_safety / eicr / epc / hmo_licence / fire_risk_assessment / fire_alarm / emergency_lighting / pat / legionella / asbestos / co_alarm / smoke_alarm / oil_safety / deposit_protection / right_to_rent / insurance / other)
- [x] Required-vs-recommended derivation from property kind (existing `requiredComplianceKinds` in `lib/domain/compliance.ts`)
- [x] Status compute (`valid` | `expiring` | `expired` | `missing` | `exempt`) — domain function + per-property rollup with `next expiring` card on the Compliance tab
- [x] Daily enqueue function (`enqueue_compliance_reminders()`) — PL/pgSQL, idempotent via the (org, related, days_until_event) unique constraint, weekend suppression for positive offsets, 14-day onboarding grace, supersede AFTER UPDATE trigger
- [x] Atomic claim function (`claim_pending_reminders(limit)`) with `FOR UPDATE SKIP LOCKED`
- [x] Send loop in `lib/cron/send-reminders.ts` (allowed service-role path) called from the thin `/api/cron/send-reminders` route with `CRON_SECRET` bearer check
- [x] Email provider abstraction (`lib/email/send.ts`) — Resend in prod, `console` in dev
- [x] Template registry (`lib/email/templates/`) with first template `compliance_reminder`
- [x] Per-user notification preferences — `organisation_members.notify_{compliance,mortgages,tenancies}` + `/settings/notifications`
- [x] Cron observability — `cron_run_log` table + owner-only `/admin/cron-log` page
- [x] `vercel.json` registers `/api/cron/send-reminders` on the `*/10 * * * *` schedule
- [x] pg_cron schedule for `enqueue_compliance_reminders()` — operator-run-once SQL at `scripts/pg_cron_schedule.sql`
- [x] Compliance dashboard tile on `/dashboard` (count of items expiring/expired or missing — recomputes live from `expiry_date` rather than the stored `status` to avoid stale reads)
- [ ] Vitest integration test that exercises enqueue → claim → send → reminder row state (needs live Supabase)

**DoD progress**: typecheck clean; 119/119 unit tests passing; 38 routes compile (was 35; +3 in this milestone: `/compliance`, `/compliance/new`, `/compliance/[id]`, `/compliance/[id]/edit`, `/settings/notifications`, `/admin/cron-log`, `/api/cron/send-reminders`). Engine is end-to-end ready against a Supabase that has `pg_cron` enabled and `CRON_SECRET` configured. The DB-side migration is idempotent (uses `if not exists` + `do $$ … if not exists` everywhere).

## M7 — Documents + OCR auto-extraction ✅ delivered

- [x] Document upload to Supabase Storage (signed URLs only; org-prefixed paths enforced client + bucket policy + action)
- [x] MIME type and size validation (client + storage bucket `file_size_limit` / `allowed_mime_types`; server action re-checks org prefix)
- [x] OCR pipeline (tesseract.js + pdfjs text layer) triggered via `/api/jobs/ocr` background job (`lib/jobs/ocr-document.ts`)
- [x] Pattern-match extraction per cert kind (EPC, gas safety, EICR + generic fallback in `lib/ocr/extract/`)
- [x] "Confirm extracted fields" UI step (`confirm-extraction-panel.tsx`) before compliance item creation
- [x] Documents linked to property / unit / tenancy / mortgage (at least one linkage required)

**DoD**: Upload a real gas safety certificate; OCR extracts next inspection date and engineer ID; user confirms; compliance item auto-created with status `valid`.

## M8 — Maintenance ✅ delivered

- [x] Maintenance jobs CRUD with priority and status (+ quotes, invoices, job-event timeline)
- [x] Kanban view with drag-and-drop — board view at `/maintenance?view=board` with HTML5 drag-and-drop, `moveJob` action + dashboard health tile (2026-07-03)
- [x] Cost estimate vs actual tracking (quotes vs invoices vs `cost_pence`)
- [x] Contractor directory (contact details + insurance expiry warning)
- [x] Per-property maintenance history (property Maintenance tab)

**DoD**: Drag-and-drop status changes persist; properties roll up to a maintenance health score on the dashboard.

## M9 — AASC module ✅ delivered

- [x] `aasc_areas` admin tool (areas page; rows seeded/maintained via service-role tooling)
- [x] Property AASC suitability check (LHA SAR + Clearsprings ceiling; closed-area check on placement creation)
- [x] `aasc_contracts` CRUD per organisation
- [x] `aasc_placements` CRUD linked to property and tenancy (transactional RPC)
- [x] Service user counts only — no identity storage (count-change ledger)
- [x] AASC dashboard: placements, weekly income, contract events
- [x] Closed-area DoD: creating a placement in a closed Serco area hard-refuses unless explicitly overridden; overrides write an `audit_log` OVERRIDE entry (added 2026-07-02)

**DoD**: Creating a placement in a CLOSED Serco area surfaces a hard warning with override + audit-log entry. Service user counts never coexist with PII columns in any row.

## M10 — Reports ✅ delivered

Seven server-rendered PDFs via `@react-pdf/renderer`:

1. [x] Portfolio summary (`/api/reports/portfolio-summary`) — per-property KPIs, value, debt, weighted LTV/yield, let-blocked callout
2. [x] Entity P&L statement (`/api/reports/entity-pandl/[id]`) — YTD monthly breakdown by category, tax-estimate footer (S24 for individuals @ 40% / CT @ 25% for companies)
3. [x] Property pack (`/api/reports/property-pack/[id]`) — full property profile: address, KPIs, MEES, HMO, mortgages, valuations, tenancies, compliance
4. [x] Compliance status report (`/api/reports/compliance-status`)
5. [x] Mortgage book report (`/api/reports/mortgage-book`) — every mortgage + 1pp / 2pp rate-shock sensitivity
6. [x] AASC placement report (`/api/reports/aasc-placements`) — active placements, weekly + annual gross/net, contract events. **Service-user counts only — no identity fields**
7. [x] Investor capital account statement (`/api/reports/investor-capital-statement`)

Entry points: the `/reports` index lists all seven. Per-entity reports (Entity P&L) and per-property reports (Property pack) link from the entity / property detail pages directly.

## M11 — Investor reporting (HydrogenCap layer) ✅ delivered

- [x] Capital accounts: contributions, distributions, fees, valuation adjustments (`investor_transactions` ledger)
- [x] Per-investor IRR (`xirrBps`, Newton iteration over dated cashflows)
- [x] Simplified preferred-return accrual (`lib/domain/investor.ts`; full waterfall with promote documented as out of scope in-code)
- [x] Investor-facing reporting view with read-only access — read-only `/portfolio-statement` (pure RSC, no mutations), reachable by every role incl. `viewer`; viewers are scoped to investor rows whose `contact_email` matches their sign-in email (2026-07-03)

**DoD**: Two investors with different entry dates and amounts both see correct individual IRR and capital balances.

## M12 — Polish + launch 🚧 in progress

- [x] Empty states everywhere (EmptyState across 34 pages)
- [x] Loading skeletons on all main sections (2026-07-02)
- [x] Error boundaries with friendly recovery (`global-error`, `(app)/error`, `(auth)/error`; 2026-07-02)
- [x] App navigation + sign-out (2026-07-02 — previously unreachable sections)
- [x] Team members & invitations UI (`/settings/members`; invite emails still console-only — needs an invitation template in `lib/email/send.ts`)
- [x] Favicon, robots.txt, metadata title template (2026-07-02)
- [ ] In-product help / changelog
- [ ] Sentry wired and tested (not present anywhere — M0 claimed it, it was never added)
- [ ] Marketing site (`/about`, `/pricing`, `/legal/*`)
- [ ] Privacy policy + terms (GDPR-aware)
- [ ] Production deploy to Vercel + Supabase production project
- [ ] Database backup strategy documented

**DoD**: First external user can sign up, onboard, import a CSV of 20 properties, and use all dashboards without an assist call.
