# Testing Strategy

Three layers, three purposes. Each layer has a non-negotiable role.

## 1. Unit tests (Vitest)

**Scope**: pure functions in `lib/domain/`, Zod schemas, formatting helpers.

**Why**: these are the rules of UK property economics. A bug here propagates across the whole product invisibly.

**Coverage gate**: ≥80% lines on `lib/domain/`, ≥60% overall.

**Pattern**:

```ts
// lib/domain/icr.test.ts
import { describe, it, expect } from 'vitest'
import { icr, effectiveStressBps } from './icr'

describe('effectiveStressBps', () => {
  it('uses pay rate for 5+ year fixes', () => {
    expect(effectiveStressBps({ payRateBps: 450, productYears: 5 } as any)).toBe(450)
    expect(effectiveStressBps({ payRateBps: 450, productYears: 10 } as any)).toBe(450)
  })

  it('applies +200bps minimum 550 for shorter products', () => {
    expect(effectiveStressBps({ payRateBps: 450, productYears: 2 } as any)).toBe(650)
    expect(effectiveStressBps({ payRateBps: 200, productYears: 2 } as any)).toBe(550) // floor
  })
})

describe('icr', () => {
  it('passes when rent comfortably covers stressed interest', () => {
    const result = icr({
      monthlyRentPence: 100_000n,        // £1,000/mo
      balancePence: 10_000_000n,         // £100,000
      payRateBps: 450,                   // 4.5%
      productYears: 2,
      borrowerKind: 'individual_higher',
    })
    // Stress = 6.5%. Monthly interest = 100,000 * 0.065 / 12 = ~541.67
    // Ratio = 1,000 / 541.67 = ~1.846
    expect(result.passes).toBe(true)
    expect(result.threshold).toBe(1.45)
    expect(result.stressBps).toBe(650)
  })

  it('fails for higher-rate borrower on a thin margin', () => {
    const result = icr({
      monthlyRentPence: 60_000n,
      balancePence: 10_000_000n,
      payRateBps: 450,
      productYears: 2,
      borrowerKind: 'individual_higher',
    })
    expect(result.passes).toBe(false)
  })
})
```

Each function in `lib/domain/` has at least three cases: happy path, edge case (zero, boundary), and a realistic real-world figure from your portfolio.

## 2. Integration tests (Vitest + local Supabase)

**Scope**: server actions, RLS policies, OCR extraction, CSV import.

**Why**: tests the seam between application logic and the database, including RLS evaluation.

**Setup**: run a local Supabase instance via `supabase start`. CI uses ephemeral DB per run.

**Pattern**:

```ts
// tests/integration/rls-properties.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestUser, createTestOrg, signIn } from './helpers'

describe('Properties RLS', () => {
  let orgA: string, orgB: string, userA: string, userB: string

  beforeEach(async () => {
    orgA = await createTestOrg('Org A')
    orgB = await createTestOrg('Org B')
    userA = await createTestUser('a@test.com', { orgId: orgA, role: 'owner' })
    userB = await createTestUser('b@test.com', { orgId: orgB, role: 'owner' })
  })

  it('user A cannot read user B properties', async () => {
    const sbA = await signIn(userA)
    const sbB = await signIn(userB)

    await sbB.from('properties').insert({ organisation_id: orgB, address_line_1: 'B House', /*...*/ })

    const { data } = await sbA.from('properties').select('*')
    expect(data).toEqual([])
  })

  it('user A cannot insert into org B', async () => {
    const sbA = await signIn(userA)
    const { error } = await sbA.from('properties').insert({ organisation_id: orgB, /*...*/ })
    expect(error?.code).toBe('42501')  // RLS rejection
  })

  it('user A cannot steal property into their org', async () => {
    const sbA = await signIn(userA)
    const sbB = await signIn(userB)
    const { data: created } = await sbB.from('properties').insert({ organisation_id: orgB, /*...*/ }).select().single()

    const { error } = await sbA
      .from('properties')
      .update({ organisation_id: orgA })
      .eq('id', created.id)

    expect(error).toBeTruthy()  // update should fail — with check predicate
  })
})
```

Run one such suite per tenant-scoped table.

## 3. End-to-end tests (Playwright)

**Scope**: critical user journeys.

**Why**: the only test that exercises the full stack — auth, RLS, server actions, client interactions, page rendering.

**The non-negotiable suite** (must pass to merge any PR):

1. New user signs up, creates an org, invites a colleague.
2. User in org A creates a property; user in org B does not see it.
3. CSV import: upload 5-row file, validate, commit, see 5 properties in list.
4. Property detail loads with all tabs and core figures non-NaN.
5. Compliance item with expiry in 25 days triggers a reminder row.
6. Mortgage expiring in 90 days appears on dashboard tile.
7. Report PDF download works for portfolio summary.

**Pattern**:

```ts
// tests/e2e/tenant-isolation.spec.ts
import { test, expect } from '@playwright/test'

test('cross-org property access is impossible', async ({ browser }) => {
  const ctxA = await browser.newContext({ storageState: 'tests/auth/user-a.json' })
  const ctxB = await browser.newContext({ storageState: 'tests/auth/user-b.json' })

  const pageA = await ctxA.newPage()
  await pageA.goto('/properties/new')
  await pageA.fill('[name="addressLine1"]', 'Test Property')
  await pageA.fill('[name="postcode"]', 'OX1 1AA')
  // ... fill rest ...
  await pageA.click('button:has-text("Create")')
  await pageA.waitForURL(/\/properties\/[a-f0-9-]+/)
  const propertyUrl = pageA.url()
  const propertyId = propertyUrl.split('/').pop()!

  const pageB = await ctxB.newPage()
  await pageB.goto(propertyUrl)
  await expect(pageB.locator('h1')).toContainText('Not found')
  expect(pageB.url()).toContain('/404')

  await pageB.goto('/properties')
  await expect(pageB.locator('table tbody tr')).toHaveCount(0)
})
```

## Test data factories

In `tests/factories/`, one factory per resource:

```ts
// tests/factories/property.ts
import { faker } from '@faker-js/faker'

export function makeProperty(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    addressLine1: faker.location.streetAddress(),
    postcode: 'OX1 1AA',
    kind: 'hmo',
    purchasePricePence: 25000000n,
    purchaseDate: faker.date.past(),
    epcRating: 'C',
    ...overrides,
  }
}
```

## Performance budgets in tests

Dashboard route must render < 1.5s p95 on seeded data. Add a Playwright trace and assert:

```ts
test('dashboard renders quickly with realistic data', async ({ page }) => {
  await seedDemoPortfolio()  // 30 properties, 12mo of transactions
  const start = Date.now()
  await page.goto('/dashboard')
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')
  expect(Date.now() - start).toBeLessThan(1500)
})
```

## What not to test

1. Third-party library internals (Recharts, react-hook-form).
2. Network of Supabase Auth flow — they have their own tests.
3. Visual pixel-perfection of PDF reports (snapshot the text content, not rendered images).
4. CSS layouts in unit tests — Playwright is the right layer.

## CI gate

```yaml
# .github/workflows/ci.yml (extract)
- run: pnpm typecheck
- run: pnpm lint
- run: pnpm test --coverage
- run: pnpm exec supabase start
- run: pnpm test:integration
- run: pnpm exec playwright install --with-deps
- run: pnpm test:e2e
- run: pnpm build
```

A red bar on any of these blocks merge. No exceptions for "I'll fix it after".
