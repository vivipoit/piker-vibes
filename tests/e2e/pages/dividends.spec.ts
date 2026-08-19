import { expect, test } from '@playwright/test'
import { mockCsvData } from '../helpers'

test.beforeEach(async ({ page }) => {
  await mockCsvData(page)
})

test('lists dividend payers sorted by total received, in display currency', async ({ page }) => {
  await page.goto('/dividends')

  // DDD paid BRL 15.00 (-> USD 3.00 at the default 5:1 rate); BBB paid USD 2.50.
  // Sorted by converted total descending: DDD (3.00) then BBB (2.50).
  await expect(page.getByText('USD $ 5.50', { exact: true })).toBeVisible()

  // Both dividends were paid in Jan 2024, well outside any trailing-12-month
  // window, so those stat cards (and their average) are always $0.00
  // regardless of when the test runs.
  const statCards = page.locator('.mantine-Card-root')
  await expect(page.getByText('Total Dividends Received')).toBeVisible()
  await expect(statCards.filter({ hasText: 'Last 12 Months' })).toContainText('USD $ 0.00')
  await expect(statCards.filter({ hasText: 'Average per Month' })).toContainText('USD $ 0.00')

  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(2)
  const tickers = await rows.locator('td:nth-child(1)').allTextContents()
  expect(tickers).toEqual(['DDD', 'BBB'])

  await expect(rows.nth(0)).toContainText('Delta Corp')
  await expect(rows.nth(0)).toContainText('USD $ 3.00')
  await expect(rows.nth(1)).toContainText('Beta Corp')
  await expect(rows.nth(1)).toContainText('USD $ 2.50')
})

test('Last 12 Months and Average per Month reflect only recent dividends', async ({ page }) => {
  // A dividend 2 months ago counts toward the trailing-12-month total; one
  // 18 months ago is outside the window and must be excluded from both the
  // Last 12 Months total and the Average per Month (which is that total / 12).
  const recentDate = new Date()
  recentDate.setMonth(recentDate.getMonth() - 2)
  const oldDate = new Date()
  oldDate.setMonth(oldDate.getMonth() - 18)
  const toIso = (d: Date) => d.toISOString().slice(0, 10)

  await mockCsvData(page, [
    { name: 'accounts.csv', content: 'account_id,bank,account_name,account_type,currency\nacc-us,Schwab,Brokerage,brokerage,USD' },
    { name: 'securities.csv', content: 'symbol,name,asset_type\nAAA,Alpha Corp,equity' },
    { name: 'prices.csv', content: 'symbol,date,close,currency\nAAA,2024-01-01,10,USD' },
    {
      name: 'transactions.csv',
      content: [
        'account_id,date,action,symbol,quantity,price,fees,amount,currency,raw_action,raw_date',
        `acc-us,${toIso(recentDate)},DIVIDEND,AAA,,,,12.00,USD,Dividend,`,
        `acc-us,${toIso(oldDate)},DIVIDEND,AAA,,,,100.00,USD,Dividend,`,
      ].join('\n'),
    },
  ])
  await page.goto('/dividends')

  const statCards = page.locator('.mantine-Card-root')
  await expect(statCards.filter({ hasText: 'Total Dividends Received' })).toContainText('USD $ 112.00')
  await expect(statCards.filter({ hasText: 'Last 12 Months' })).toContainText('USD $ 12.00')
  await expect(statCards.filter({ hasText: 'Average per Month' })).toContainText('USD $ 1.00')
})

test('shows a placeholder when there are no dividends', async ({ page }) => {
  await mockCsvData(page, [
    { name: 'accounts.csv', content: 'account_id,bank,account_name,account_type,currency\nacc-us,Schwab,Brokerage,brokerage,USD' },
    { name: 'securities.csv', content: 'symbol,name,asset_type\nAAA,Alpha Corp,equity' },
    { name: 'prices.csv', content: 'symbol,date,close,currency\nAAA,2024-01-01,10,USD' },
    {
      name: 'transactions.csv',
      content:
        'account_id,date,action,symbol,quantity,price,fees,amount,currency,raw_action,raw_date\nacc-us,2024-01-01,BUY,AAA,1,10,,-10,USD,Buy,01/01/2024',
    },
  ])
  await page.goto('/dividends')

  await expect(page.getByText('No dividends received.')).toBeVisible()
  // All three stat cards (total, last 12 months, average per month) are $0
  // when there's no dividend history at all.
  await expect(page.getByText('USD $ 0.00')).toHaveCount(3)
})

test('loads and renders without console or page errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/dividends')
  await expect(page.getByText('Top Dividend Payers')).toBeVisible()

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
