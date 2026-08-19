import { expect, test } from '@playwright/test'
import { mockCsvData, selectSecurity } from '../helpers'

test.beforeEach(async ({ page }) => {
  await mockCsvData(page)
})

test('lists securities that have price data, labeled by ticker only', async ({ page }) => {
  await page.goto('/price-history')
  await page.getByPlaceholder('Select a security').click()

  await expect(page.getByRole('option', { name: 'AAA', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'BBB', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'CCC', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'DDD', exact: true })).toBeVisible()
  // No company name in the dropdown — see build history ("symbols only").
  await expect(page.getByRole('option', { name: 'Alpha Corp' })).toHaveCount(0)
})

test('shows a placeholder message until a security is selected', async ({ page }) => {
  await page.goto('/price-history')
  await expect(page.getByText('Choose a security above to see its price history.')).toBeVisible()
  await expect(page.locator('.recharts-wrapper')).toHaveCount(0)
})

test('renders a buy dot and a sell dot for a fully sold-out position', async ({ page }) => {
  await page.goto('/price-history')
  await selectSecurity(page, 'AAA')

  await expect(page.locator('.recharts-wrapper')).toBeVisible()
  await expect(page.locator('.recharts-reference-dot')).toHaveCount(2)
})

test('renders only a buy dot for a position that is still held', async ({ page }) => {
  await page.goto('/price-history')
  await selectSecurity(page, 'BBB')

  await expect(page.locator('.recharts-wrapper')).toBeVisible()
  await expect(page.locator('.recharts-reference-dot')).toHaveCount(1)
})

test('renders the price line with no ownership dots for a security never transacted', async ({ page }) => {
  await page.goto('/price-history')
  await selectSecurity(page, 'CCC')

  await expect(page.locator('.recharts-wrapper')).toBeVisible()
  await expect(page.locator('.recharts-reference-dot')).toHaveCount(0)
})

test('shows the average price reference line for a held position', async ({ page }) => {
  await page.goto('/price-history')
  await selectSecurity(page, 'BBB')

  await expect(page.getByText('Avg USD 22.00')).toBeVisible()
})

test('loads and renders without console or page errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/price-history')
  await selectSecurity(page, 'AAA')
  await expect(page.locator('.recharts-wrapper')).toBeVisible()

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
