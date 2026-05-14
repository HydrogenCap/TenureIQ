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
    const orgA = await createTestOrg(userA.id, 'Org A Isolation')

    const userB = await createTestUser('isolation-b@test.com')
    const orgB = await createTestOrg(userB.id, 'Org B Isolation')

    // User B creates a property
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await signInUser(pageB, userB.email)
    await pageB.goto('/properties/new')
    await pageB.fill('[name="addressLine1"]', 'Secret Property')
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
})
