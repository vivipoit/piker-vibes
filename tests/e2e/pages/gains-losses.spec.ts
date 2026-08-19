import { expect, test } from '@playwright/test'
import { mockCsvData } from '../helpers'

test.beforeEach(async ({ page }) => {
  await mockCsvData(page)
})

test('unrealized view shows a bubble per open, priced position and a table sorted by % gain/loss descending', async ({ page }) => {
  await page.goto('/gains-losses')

  // BBB and DDD are open + priced; AAA is fully sold (realized only); EEE has no price history.
  await expect(page.locator('.recharts-wrapper')).toBeVisible()
  await page.waitForSelector('table')
  const tickers = await page.locator('table tbody tr td:first-child').allTextContents()
  expect(new Set(tickers)).toEqual(new Set(['BBB', 'DDD']))

  const pctCells = await page.locator('table tbody tr td:nth-child(3)').allTextContents()
  const pcts = pctCells.map((t) => parseFloat(t.replace('%', '')))
  const sorted = [...pcts].sort((a, b) => b - a)
  expect(pcts).toEqual(sorted)
})

test('switches to the realized view and back', async ({ page }) => {
  await page.goto('/gains-losses')

  await page.getByRole('button', { name: 'Realized' }).click()
  await expect(page.getByText('Total Realized Gains')).toBeVisible()
  await expect(page.getByText('Total Realized Losses')).toBeVisible()
  await expect(page.getByText('Net Realized')).toBeVisible()

  // Only AAA was ever sold: proceeds 150 - cost 110 = a 40 gain, no losses.
  await expect(page.getByText('USD $ 40.00', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('No realized losses.')).toBeVisible()

  await page.getByRole('button', { name: 'Back to Unrealized' }).click()
  await expect(page.locator('.recharts-wrapper')).toBeVisible()
})

test('loads and renders without console or page errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/gains-losses')
  await expect(page.locator('.recharts-wrapper')).toBeVisible()

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
