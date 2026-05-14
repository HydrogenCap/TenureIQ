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

## M2 — Properties + entities

- [ ] Entities CRUD (Ltd, LLP, individual, SPV) with shareholders
- [ ] Properties CRUD with full property detail page
- [ ] Bank accounts at entity level
- [ ] Property list with filters (kind, EPC, entity, AASC flag, MEES status)
- [ ] CSV import wizard for properties (papaparse → Zod validation → preview → commit)
- [ ] MEES + HMO licence + Article 4 status surfaced on property detail

**DoD**: Owner can import 20 properties from CSV, see them in list, filter by EPC F/G, and the let-blocked count surfaces on the dashboard.

## M3 — Units + tenancies

- [ ] Units CRUD per property
- [ ] Tenant directory (AST tenants — names/contact details)
- [ ] Tenancies CRUD with `kind` discriminator (AST, AASC placement, licence, etc)
- [ ] Right-to-rent expiry tracking on tenants
- [ ] Tenancy timeline view per property
- [ ] AASC placement tenancies: no tenant FK, just `aasc_placement_ref` + service_user_count

**DoD**: Mixed AST + AASC tenancies render correctly. A property with 5 occupants in 2+ households flags as requiring mandatory HMO licence.

## M4 — Mortgages + valuations + domain calcs

- [ ] Mortgages CRUD with product/fix details
- [ ] Mortgage events (drawdown, payment, rate_change, redemption)
- [ ] Valuations history per property
- [ ] Per-property finance tab: equity, LTV, stressed LTV (200bps), ICR pass/fail, refinance headroom
- [ ] Portfolio dashboard tiles: total value, total debt, weighted avg LTV, weighted yield
- [ ] Mortgage fix expiry calendar / list

**DoD**: All `lib/domain/` functions are used in real UI. Dashboard tiles render correctly for a seeded portfolio of 5 properties.

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
