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

## M2 — Properties + entities 🚧 in progress

- [x] Entities CRUD (Ltd, LLP, individual, SPV) — list, create, detail, edit, archive, restore
- [x] Properties CRUD — list, create, detail with KPIs and tabs (Overview live; Units/Finance/Compliance/Maintenance/Documents stubbed for later milestones), edit, archive, restore
- [x] Property list with search + filters (entity, kind)
- [x] CSV import wizard for properties (papaparse → Zod row validation → preview with row-level errors → batched commit with progress)
- [x] Property KPIs domain function (`propertyKpis`) with tests
- [x] HMO licence + Article 4 + AASC flags surfaced on property detail
- [ ] Bank accounts at entity level (deferred — sized for M5 alongside transactions)
- [ ] Shareholders tab (stubbed — moves to M11 with investor capital accounts)
- [ ] MEES status badge on the list (depends on M6 compliance derivation)

**DoD progress**: typecheck clean; 47 unit tests pass including 5 for `propertyKpis`. Playwright tenant-isolation spec extended (entities + archived-list-hidden) and ready to execute once Supabase is running. Manual UI verification requires `pnpm dev` against a live local Supabase — not run in this bootstrap pass.

## M3 — Units + tenancies 🚧 in progress

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
- [ ] AASC placement tenancies: schema fields exist (aasc_placement_ref, aasc_contractor); the user-facing creation flow lives in M8 per the prompt
- [ ] Playwright tenancy-create + MEES-block spec (deferred — needs live Supabase to run)

**DoD progress**: typecheck clean; 73/73 unit tests pass; 20 routes compile. Migration-reviewer + security-reviewer P0/P1 findings addressed in 20260515000001_m03_security_fixes. Known follow-up: createTenancy multi-step is not transactional — supabase-js doesn't expose multi-statement transactions; cleanest fix is a Postgres RPC, queued for when several similar multi-step actions land.

## M4 — Mortgages + valuations + domain calcs 🚧 in progress

- [x] Mortgages CRUD: list, create (seeds drawdown event), detail with KPIs (balance / rate / LTV / fixed-end), edit, archive
- [x] Mortgage events: drawdown, payment, payment_interest_only, rate_change, product_switch, redemption, er_charge, reconciliation — inline Record-Event form on the detail page. recordMortgageEvent re-derives `current_balance_pence` from the full ledger after every write.
- [x] setCurrentBalance manual reconciliation writes both the column and an event row.
- [x] Valuations history per property — Add Valuation inline form on the Finance tab; market-grade kinds (red_book, refinance, purchase) override the live valuation only when not older than current.
- [x] Per-property Finance tab populated (replaces M2 stub) — mortgages + valuations side-by-side.
- [x] Portfolio dashboard tiles live: count, value, debt + equity, weighted-average LTV.
- [x] Refinance window card: count of mortgages with fixed-rate end ≤180 days, deep-links to `/mortgages?fixedEndWithin=180`.
- [x] Domain: currentInterestRateBps, monthlyInterestPence, monthsUntil, daysUntilFixedEnd, deriveBalancePence, weightedAverageLtvBps, portfolioTotals — 27 new unit tests.
- [ ] Stressed LTV (200bps) + ICR pass/fail UI on Finance tab — domain helpers (`stressedLtvBps`, `icr`) already exist; small UI follow-up.
- [ ] Per-property weighted yield — needs M3 active-tenancy rollup wired into Finance tab.
- [ ] Playwright spec (create property → add mortgage → record payment → verify balance + LTV update) — deferred, needs live Supabase.
- [ ] migration-reviewer + security-reviewer on this diff (commit `fba06c9`) — to run before merge.

**DoD progress**: typecheck clean; 100/100 unit tests pass (was 73); 24 routes compile (was 20; +4 mortgage routes). Property KPIs now use real mortgage balance. Known follow-up: `createMortgage` drawdown-event seed is not transactional — same RPC pattern as M3 `createTenancy`, queued.

## M5 — Transactions + entity P&L + director loan ledger

- [ ] Transactions table with `category_code` (rent, mortgage_payment, maintenance, insurance, …)
- [ ] CSV import for bank statements with category mapping memory
- [ ] Reconciliation flag per transaction
- [ ] Entity P&L view: rental income, mortgage interest, costs, Section 24 cost, net profit, tax estimate
- [ ] Director loan ledger per director per entity (loan_in, loan_out, interest_accrued, repayment, running balance)
- [ ] Investor capital accounts per investor per entity

**DoD**: For a seeded entity with realistic transactions, the P&L matches a hand-calculated control to within ±£1.

## M6 — Compliance + cron reminders

- [ ] Compliance items CRUD per property
- [ ] Required-vs-recommended derivation from property kind
- [ ] Status auto-compute (`valid`/`expiring`/`expired`/`missing`)
- [ ] Daily cron at 07:00 Europe/London — generates Reminder rows
- [ ] Email delivery via Resend/Postmark (configurable provider)
- [ ] Compliance dashboard tile + dedicated compliance list page

**DoD**: A property with a gas cert expiring in 25 days generates a reminder by the next cron tick; reminder email is delivered to the org owner.

## M7 — Documents + OCR auto-extraction

- [ ] Document upload to Supabase Storage (signed URLs only)
- [ ] MIME type and size validation in server action (50MB / pdf/jpg/png/heic)
- [ ] OCR pipeline (Tesseract or cloud-based) triggered as background job
- [ ] Pattern-match extraction per cert kind (EPC, gas, EICR, insurance, HMO licence)
- [ ] "Confirm extracted fields" UI step before auto-creating compliance items
- [ ] Documents linked to property and optionally to specific compliance_item

**DoD**: Upload a real gas safety certificate; OCR extracts next inspection date and engineer ID; user confirms; compliance item auto-created with status `valid`.

## M8 — Maintenance kanban

- [ ] Maintenance jobs CRUD with priority and status
- [ ] Kanban view (reported → triaged → in_progress → awaiting_quote → completed)
- [ ] Cost estimate vs actual tracking
- [ ] Contractor directory (lightweight — just contact details)
- [ ] Per-property maintenance history

**DoD**: Drag-and-drop status changes persist; properties roll up to a maintenance health score on the dashboard.

## M9 — AASC module

- [ ] `aasc_areas` admin tool (seed Serco statuses, Clearsprings demand gaps)
- [ ] Property AASC suitability check (area status, demand gap, MEES, HMO licence)
- [ ] `aasc_contracts` CRUD per organisation
- [ ] `aasc_placements` CRUD linked to property and (optionally) tenancy
- [ ] Service user counts only — no identity storage
- [ ] AASC dashboard: placements by contractor, weekly income, occupancy, demand-gap context

**DoD**: Creating a placement in a CLOSED Serco area surfaces a hard warning with override + audit-log entry. Service user counts never coexist with PII columns in any row.

## M10 — Reports

Seven server-rendered PDFs via `@react-pdf/renderer`:

1. Portfolio summary (per-property KPIs, total value, total debt, weighted LTV/yield)
2. Entity P&L statement
3. Property pack (full property profile for investor or refinance application)
4. Compliance status report
5. Mortgage book report
6. AASC placement report
7. Investor capital account statement

**DoD**: All 7 PDFs generate from the seeded portfolio without errors, render correctly in a PDF reader, and complete in < 5s per report.

## M11 — Investor reporting (HydrogenCap layer)

- [ ] Capital accounts: contributions, distributions, fees, valuation adjustments
- [ ] Per-investor IRR (XIRR-style across cashflows)
- [ ] Distribution waterfall (configurable preferred return, then promote)
- [ ] Investor-facing reporting view with read-only access (uses `viewer` role)

**DoD**: Two investors with different entry dates and amounts both see correct individual IRR and capital balances.

## M12 — Polish + launch

- [ ] Empty states everywhere (not just blank tables)
- [ ] Loading skeletons on slow tabs
- [ ] Error boundaries with friendly recovery
- [ ] In-product help / changelog
- [ ] Sentry wired and tested
- [ ] Marketing site (`/about`, `/pricing`, `/legal/*`)
- [ ] Privacy policy + terms (GDPR-aware)
- [ ] Production deploy to Vercel + Supabase production project
- [ ] Database backup strategy documented

**DoD**: First external user can sign up, onboard, import a CSV of 20 properties, and use all dashboards without an assist call.
