import { expect, test } from '@playwright/test'
import { legendItem, mockCsvData } from '../helpers'

test.beforeEach(async ({ page }) => {
  await mockCsvData(page)
})

function donut(page: import('@playwright/test').Page, title: string) {
  return page.locator('.mantine-Card-root', { hasText: title })
}

test('renders all six donut breakdowns with expected slices', async ({ page }) => {
  await page.goto('/allocation')

  // Region: BBB (US/Schwab) and DDD (Brasil/Nubank) are the only open, priced
  // positions — AAA is fully sold, EEE has no price history.
  const region = donut(page, 'Holdings by Region')
  await expect(legendItem(region, 'US')).toBeVisible()
  await expect(legendItem(region, 'Brasil')).toBeVisible()

  const account = donut(page, 'Holdings by Account')
  await expect(legendItem(account, 'Schwab — Brokerage')).toBeVisible()
  await expect(legendItem(account, 'Nubank — Corretora')).toBeVisible()

  const assetType = donut(page, 'Holdings by Asset Class')
  await expect(legendItem(assetType, 'Stocks')).toBeVisible()
  await expect(legendItem(assetType, 'REITs/FIIs')).toBeVisible()

  const asset = donut(page, 'Holdings by Asset')
  await expect(legendItem(asset, 'BBB')).toBeVisible()
  await expect(legendItem(asset, 'DDD')).toBeVisible()

  // Only AAA was ever sold, for a gain — no realized losses anywhere in the fixture.
  const gains = donut(page, 'Realized Gains by Asset')
  await expect(legendItem(gains, 'AAA')).toBeVisible()

  const losses = donut(page, 'Realized Losses by Asset')
  await expect(losses.getByText('No data yet.')).toBeVisible()
})

test('loads and renders without console or page errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/allocation')
  await expect(donut(page, 'Holdings by Region')).toBeVisible()

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
