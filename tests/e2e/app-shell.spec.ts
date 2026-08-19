import { expect, test } from '@playwright/test'
import { mockCsvData } from './helpers'

test.beforeEach(async ({ page }) => {
  await mockCsvData(page)
})

test('navigates between every page via the sidebar, highlighting the active link', async ({ page }) => {
  await page.goto('/')

  const pages: [string, string][] = [
    ['Allocation', 'Allocation'],
    ['Portfolio', 'Portfolio'],
    ['G/L', 'G/L'],
    ['Dividends', 'Dividends'],
    ['Price History', 'Price History'],
    // Data Status sits apart from the main nav group (near the CSV file
    // count footer, not the portfolio pages), but is still an <a> in the
    // same <nav> so the same click-and-check loop covers it.
    ['Data Status', 'Data Status'],
    ['Dashboard', 'Dashboard'],
  ]

  const nav = page.locator('nav')
  for (const [navLabel, heading] of pages) {
    const link = nav.locator('a').filter({ hasText: new RegExp(`^${navLabel}$`) })
    await link.click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(link).toHaveAttribute('data-active', 'true')
  }
})

test('shows the loaded CSV file count and reloads on demand', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('4 CSV files loaded')).toBeVisible()
  await page.getByRole('button', { name: 'Reload CSV data' }).click()
  await expect(page.getByText('4 CSV files loaded')).toBeVisible()
})
