import { expect, test } from '@playwright/test'
import { mockCsvData } from '../helpers'

test.beforeEach(async ({ page }) => {
  await mockCsvData(page)
})

test('renders the stat cards, donuts, and top gains/losses', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Total Value')).toBeVisible()
  await expect(page.getByText('Total Growth')).toBeVisible()
  await expect(page.getByText('Total Dividends Received')).toBeVisible()
  await expect(page.getByText('Annualized Return')).toBeVisible()

  // Fixture has both BUYs (outflows) and a still-open position priced above
  // cost, so XIRR should resolve to a positive rate rather than the "—"
  // shown when there isn't enough data to solve.
  const annualizedCard = page.locator('.mantine-Card-root', { hasText: 'Annualized Return' })
  await expect(annualizedCard.getByText('%')).toBeVisible()

  await expect(page.getByText('Holdings by Region')).toBeVisible()
  await expect(page.getByText('Holdings by Account')).toBeVisible()

  // BBB and DDD both have unrealized gains at the latest price; nothing is
  // currently at an unrealized loss in the fixture.
  const gainsCard = page.locator('.mantine-Card-root', { hasText: 'Top Unrealized Gains' })
  await expect(gainsCard.getByText('BBB', { exact: true })).toBeVisible()
  await expect(gainsCard.getByText('DDD', { exact: true })).toBeVisible()
  await expect(page.getByText('No unrealized losses.')).toBeVisible()
})

test('loads and renders without console or page errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
