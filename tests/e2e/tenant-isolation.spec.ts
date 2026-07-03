import { test, expect } from '@playwright/test'
import { createTestUser, signInUser, createTestOrg } from './helpers'

/**
 * The TenureIQ tenant isolation gate.
 * If this fails, do not merge — RLS is the foundation everything else relies on.
 */

test.describe('Tenant isolation', () => {
  test('user in org A cannot read properties in org B', async ({ browser }) => {
    // Setup: two independent users, two independent orgs
    const userA = await createTestUser('isolation-a@test.com')
    await createTestOrg(userA.id, 'Org A Isolation')

    const userB = await createTestUser('isolation-b@test.com')
    await createTestOrg(userB.id, 'Org B Isolation')

    // User B creates a property
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await signInUser(pageB, userB.email)

    // The property form requires an entity (and city), so create one first.
    await pageB.goto('/entities/new')
    await pageB.fill('[name="name"]', 'Secret B Holdings')
    await pageB.selectOption('[name="kind"]', 'ltd')
    await pageB.click('button:has-text("Create")')
    await pageB.waitForURL(/\/entities\/[a-f0-9-]+/)

    await pageB.goto('/properties/new')
    await pageB.selectOption('[name="entityId"]', { index: 1 })
    await pageB.fill('[name="addressLine1"]', 'Secret Property')
    await pageB.fill('[name="city"]', 'Cheltenham')
    await pageB.fill('[name="postcode"]', 'GL52 6AA')
    await pageB.selectOption('[name="kind"]', 'hmo')
    await pageB.fill('[name="purchasePricePence"]', '25000000')
    await pageB.fill('[name="purchaseDate"]', '2024-01-01')
    await pageB.click('button:has-text("Create")')
    await pageB.waitForURL(/\/properties\/[a-f0-9-]+/)
    const secretPropertyId = pageB.url().split('/').pop()!
    await ctxB.close()

    // User A signs in to org A
    const ctxA = await browser.newContext()
    const pageA = await ctxA.newPage()
    await signInUser(pageA, userA.email)

    // Direct URL access should 404
    await pageA.goto(`/properties/${secretPropertyId}`)
    await expect(pageA.locator('h1, h2').first()).toContainText(/not found/i)

    // List view should have zero rows
    await pageA.goto('/properties')
    const rows = pageA.locator('table tbody tr')
    await expect(rows).toHaveCount(0)
  })

  test('user in org A cannot insert into org B', async () => {
    // Direct database test via supabase-js using user A's session
    const userA = await createTestUser('isolation-insert-a@test.com')
    await createTestOrg(userA.id, 'Org A Insert')

    const userB = await createTestUser('isolation-insert-b@test.com')
    const orgB = await createTestOrg(userB.id, 'Org B Insert')

    const sbA = await signInUser.api(userA.email)
    const { error } = await sbA.from('properties').insert({
      organisation_id: orgB,
      entity_id: '00000000-0000-0000-0000-000000000000',
      address_line_1: 'Should not be inserted',
      city: 'Test',
      postcode: 'OX1 1AA',
      kind: 'hmo',
      purchase_price_pence: 1n.toString(),
      purchase_date: '2024-01-01',
    })

    expect(error).not.toBeNull()
    // 42501 = insufficient_privilege (RLS denial)
    expect(error?.code).toBe('42501')
  })

  test('user in org A cannot read entities in org B', async ({ browser }) => {
    const userA = await createTestUser('isolation-ent-a@test.com')
    await createTestOrg(userA.id, 'Org A Entities')

    const userB = await createTestUser('isolation-ent-b@test.com')
    await createTestOrg(userB.id, 'Org B Entities')

    // User B creates an entity
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await signInUser(pageB, userB.email)
    await pageB.goto('/entities/new')
    await pageB.fill('[name="name"]', 'Secret Holdings Ltd')
    await pageB.selectOption('[name="kind"]', 'ltd')
    await pageB.click('button:has-text("Create")')
    await pageB.waitForURL(/\/entities\/[a-f0-9-]+/)
    const secretEntityId = pageB.url().split('/').pop()!
    await ctxB.close()

    // User A signs in
    const ctxA = await browser.newContext()
    const pageA = await ctxA.newPage()
    await signInUser(pageA, userA.email)

    await pageA.goto(`/entities/${secretEntityId}`)
    await expect(pageA.locator('h1, h2').first()).toContainText(/not found/i)

    await pageA.goto('/entities')
    const rows = pageA.locator('table tbody tr')
    await expect(rows).toHaveCount(0)
  })

  test('archived property does not appear in the list', async ({ browser }) => {
    const user = await createTestUser('archive-a@test.com')
    await createTestOrg(user.id, 'Archive Org')

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signInUser(page, user.email)

    // Create an entity first so we have something to attach a property to.
    await page.goto('/entities/new')
    await page.fill('[name="name"]', 'Archive Holdings')
    await page.selectOption('[name="kind"]', 'ltd')
    await page.click('button:has-text("Create")')
    await page.waitForURL(/\/entities\/[a-f0-9-]+/)

    // Create a property
    await page.goto('/properties/new')
    await page.selectOption('[name="entityId"]', { index: 1 })
    await page.fill('[name="addressLine1"]', '99 Archive Lane')
    await page.fill('[name="city"]', 'Cheltenham')
    await page.fill('[name="postcode"]', 'GL52 6AA')
    await page.selectOption('[name="kind"]', 'hmo')
    await page.fill('[name="purchasePricePence"]', '250000')
    await page.fill('[name="purchaseDate"]', '2024-01-01')
    await page.click('button:has-text("Create")')
    await page.waitForURL(/\/properties\/[a-f0-9-]+/)

    // Archive it
    await page.click('button:has-text("Archive")')
    await page.waitForLoadState('networkidle')

    // List should be empty (deleted_at is filtered out).
    await page.goto('/properties')
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(0)
  })
})
