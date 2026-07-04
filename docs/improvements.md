# TenureIQ — improvement roadmap

Proposed 4 July 2026, after M0–M11 closed out. Grounded in the codebase
as it stands (post PR #3). Effort: S = hours, M = a day or two,
L = a week-ish.

## Now — highest value per effort

1. **Rent arrears view** (M) — the single biggest landlord pain point
   not yet covered. Transactions and tenancies both exist; join expected
   rent (tenancy rent_pence × period) against received rent transactions
   per tenancy per month, surface a "who owes what" list with ageing
   buckets and a dashboard tile. Pure domain + one page; no schema
   change needed to start.
2. **Refinance what-if calculator** (M) — CLAUDE.md positions TenureIQ
   on "refinance modelling" but M4 only flags fixed-end windows. Add a
   calculator on the mortgage detail page: candidate rate/term/fee →
   new payment, ICR, stressed-ICR, monthly delta, break-even vs ERC.
   All the domain functions (monthlyInterestPence, icr, stressed LTV)
   already exist — this is composition + UI.
3. **Session-refresh middleware** (S) — there is no middleware.ts, so
   Supabase sessions only refresh when a server component happens to
   run. The @supabase/ssr-recommended middleware keeps tokens fresh and
   fixes eventual silent sign-outs mid-session.
4. **Quota-hit upgrade nudges** (S) — quota errors already return
   upgradeTo; render a proper "Upgrade to Growth" CTA linking to
   /settings/billing instead of a plain error string. Direct revenue
   lever.
5. **Debounce list search inputs** (S) — every keystroke is currently a
   server round-trip on properties/transactions/tenancies lists
   (carried over from the audit).

## Next — product depth

6. **Global search (Cmd+K)** (M) — one palette across properties,
   tenants, mortgages, transactions. Big perceived-quality jump.
7. **OCR review inbox** (M) — the OCR pipeline extracts fields but
   confirmation lives per-document. A "needs review" queue (documents
   with extracted-but-unconfirmed fields) makes the M7 feature actually
   get used.
8. **In-app notification centre** (M) — reminders are email-only; the
   reminders table already holds everything needed to render a bell
   icon + unread list.
9. **First-run onboarding** (M) — new orgs land on an empty dashboard.
   A checklist (create entity → add property → import CSV → invite
   team) plus optional demo-data seed would cut time-to-value sharply.
10. **Bulk actions on lists** (M) — bulk recategorise exists only for
    transactions; extend the pattern to compliance items (mark exempt),
    tenancies (end), documents (link to property).
11. **Investor invites** (S) — investors page + viewer role + portal
    all exist; add "invite this investor" (creates a viewer invitation
    with the investor's email) to close the loop.

## Engineering & operational hardening

12. **E2E coverage beyond tenant isolation** (M) — the deferred specs:
    MEES let-block on tenancy creation, billing quota gates, AASC
    closed-area override + audit entry, kanban moveJob. The harness now
    works; each spec is cheap to add.
13. **Reminder-engine integration test** (M) — the M6 deferred item:
    enqueue → claim → send against the CI Supabase, asserting
    idempotency and weekend suppression.
14. **Single source for migrations** (S) — prisma/migrations and
    supabase/migrations are manually-synced byte-identical copies. Add
    a CI check that diffs the trees (fail on drift) or generate one
    from the other in a script.
15. **Rate limiting** (M) — no rate limiting anywhere; login, invite,
    and CSV-import actions are the priority surfaces. Upstash Ratelimit
    or a Postgres token bucket both fit.
16. **Composite indexes** (S) — (organisation_id, deleted_at) on
    tenancies, mortgages, valuations, compliance_items, tasks,
    bank_accounts (P2 from the audit).
17. **Zod schema for registerDocument** (S) — the one remaining
    inline-typed action input (audit follow-up).
18. **Upgrade Next.js 15.0.4 → latest 15.x** (M) — 15.0 is early;
    later patches fix real bugs in the exact areas this app leans on
    (server actions, typedRoutes, client-boundary errors like the
    buttonVariants crash). Do it while the e2e suite can catch
    regressions.
19. **CI speed** (S) — cache Playwright browsers and prewarm Supabase
    docker images; e2e is ~8 min, roughly half of it downloads.
20. **docs/decisions/** (S) — CLAUDE.md tells contributors to check it;
    it does not exist. Backfill the big five decisions already made
    (RLS templates, dual clients, pence/bps, RPCs for multi-step
    writes, counts-only AASC).

## Security & compliance

21. **MFA for owner/admin** (M) — Supabase supports TOTP enrolment;
    gate it per-role from /settings.
22. **Audit log viewer** (M) — audit_log has triggers writing rich
    history and no UI; an owner-only filterable viewer turns it into a
    sellable feature ("full audit trail").
23. **Full org data export** (M) — the terms promise data portability;
    today it is partial (CSVs, PDFs). A one-click ZIP (all tables as
    CSV + documents) closes the gap and is a GDPR article-20 answer.
24. **Backup restore drill** (S, recurring) — documented in
    docs/deploy.md; automate quarterly restore-to-staging once a
    staging project exists.

## Later / bigger bets

25. **Open banking feed** (L) — TrueLayer/GoCardless bank feeds to
    replace CSV import; the staging-table + dedup + rules architecture
    was built to absorb exactly this.
26. **Tenant/contractor portals** (L) — maintenance reporting by QR
    code per property; contractors update job status themselves.
27. **Mobile PWA pass** (L) — responsive sweep + installable PWA;
    maintenance-with-photos on site is the killer use.
28. **Making Tax Digital export** (L) — entity P&L already computes
    S24-adjusted figures; an MTD-compatible quarterly export would be a
    strong differentiator for the accountant role.
