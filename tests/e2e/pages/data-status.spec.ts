import { expect, test } from '@playwright/test'
import { mockCsvData, setRegionPreset, toggleAccount } from '../helpers'

// Dates are computed relative to whenever the test actually runs (not a
// fixed fixture date) so "current"/"aging"/"stale"/"no data" stay correct
// regardless of when the suite executes - see src/utils/dataStatus.ts for
// the exact day-boundary thresholds (<=7 current, 7-30 aging, >=30 stale).
function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const ACCOUNTS_CSV = [
  'account_id,bank,account_name,account_type,currency',
  'acc-us,Schwab,Brokerage,brokerage,USD',
  'acc-mid,MidBank,Savings,brokerage,USD',
  'acc-br,Nubank,Corretora,brokerage,BRL',
].join('\n')

const SECURITIES_CSV = [
  'symbol,name,asset_type',
  'AAA,Alpha Corp,equity',
  'BBB,Beta Corp,equity',
  'CCC,Gamma Corp,equity',
  'DDD,Delta Corp,equity',
  'EEE,Epsilon Corp,equity',
  'FFF,Foxtrot Corp,equity',
].join('\n')

const PRICES_CSV = [
  'symbol,date,close,currency',
  `AAA,${daysAgo(2)},10.00,USD`,
  `BBB,${daysAgo(15)},20.00,USD`,
  `CCC,${daysAgo(40)},30.00,BRL`,
  // DDD: held, but never priced -> "no data".
  `EEE,${daysAgo(1)},50.00,USD`,
].join('\n')

const TRANSACTIONS_CSV = [
  'account_id,date,action,symbol,quantity,price,fees,amount,currency,raw_action,raw_date',
  // acc-us: last transaction 2 days ago -> current. AAA held -> current.
  `acc-us,${daysAgo(2)},BUY,AAA,10,10.00,,-100.00,USD,Buy,`,
  // acc-mid: last transaction 15 days ago -> aging. BBB held -> aging.
  `acc-mid,${daysAgo(15)},BUY,BBB,5,20.00,,-100.00,USD,Buy,`,
  // acc-br: last transaction 40 days ago -> stale. CCC held -> stale, DDD held -> no data.
  `acc-br,${daysAgo(40)},BUY,CCC,3,30.00,,-90.00,BRL,Buy,`,
  `acc-br,${daysAgo(45)},BUY,DDD,4,40.00,,-160.00,BRL,Buy,`,
  // FFF: bought then fully sold on acc-br -> excluded from the ticker table.
  `acc-br,${daysAgo(50)},BUY,FFF,1,1.00,,-1.00,BRL,Buy,`,
  `acc-br,${daysAgo(48)},SELL,FFF,1,2.00,,2.00,BRL,Sell,`,
  // EEE: has price history but was never transacted -> excluded (not held).
].join('\n')

const CSV_FILES = [
  { name: 'accounts.csv', content: ACCOUNTS_CSV },
  { name: 'securities.csv', content: SECURITIES_CSV },
  { name: 'prices.csv', content: PRICES_CSV },
  { name: 'transactions.csv', content: TRANSACTIONS_CSV },
]

test.beforeEach(async ({ page }) => {
  await mockCsvData(page, CSV_FILES)
})

test('shows one stat card count per freshness bucket, scoped to held tickers only', async ({ page }) => {
  await page.goto('/data-status')

  await expect(page.getByText('No Price Data')).toBeVisible()
  const cards = page.locator('.mantine-Card-root')
  await expect(cards.filter({ hasText: 'No Price Data' }).getByText('1', { exact: true })).toBeVisible()
  await expect(cards.filter({ hasText: 'Stale' }).getByText('1', { exact: true })).toBeVisible()
  await expect(cards.filter({ hasText: 'Aging' }).getByText('1', { exact: true })).toBeVisible()
  await expect(cards.filter({ hasText: 'Current' }).getByText('1', { exact: true })).toBeVisible()
})

test('lists accounts alphabetically with age and status, filtered accounts excluded, current filter applied', async ({ page }) => {
  await page.goto('/data-status')

  const accountRows = page.locator('table').first().locator('tbody tr')
  await expect(accountRows).toHaveCount(3)
  // Alphabetical by "bank — account name".
  await expect(accountRows.nth(0)).toContainText('MidBank — Savings')
  await expect(accountRows.nth(1)).toContainText('Nubank — Corretora')
  await expect(accountRows.nth(2)).toContainText('Schwab — Brokerage')

  await expect(accountRows.filter({ hasText: 'Schwab' })).toContainText('Current')
  await expect(accountRows.filter({ hasText: 'MidBank' })).toContainText('Aging')
  await expect(accountRows.filter({ hasText: 'Nubank' })).toContainText('Stale')
})

test('lists held tickers alphabetically with last price age and status, excluding unheld/sold symbols', async ({ page }) => {
  await page.goto('/data-status')

  const tickerTable = page.locator('table').nth(1)
  const symbols = await tickerTable.locator('tbody tr td:first-child').allTextContents()
  expect(symbols).toEqual(['AAA', 'BBB', 'CCC', 'DDD'])

  const rows = tickerTable.locator('tbody tr')
  await expect(rows.filter({ hasText: 'AAA' })).toContainText('Current')
  await expect(rows.filter({ hasText: 'BBB' })).toContainText('Aging')
  await expect(rows.filter({ hasText: 'CCC' })).toContainText('Stale')
  await expect(rows.filter({ hasText: 'DDD' })).toContainText('No Data')
  await expect(rows.filter({ hasText: 'DDD' })).toContainText('—')
})

test('respects the account filter: unchecking an account drops its account row and its tickers', async ({ page }) => {
  await page.goto('/data-status')

  await toggleAccount(page, 'Nubank — Corretora')

  const accountTable = page.locator('table').first()
  await expect(accountTable.locator('tbody tr')).toHaveCount(2)
  await expect(accountTable.getByText('Nubank — Corretora')).not.toBeVisible()

  const tickerTable = page.locator('table').nth(1)
  const symbols = await tickerTable.locator('tbody tr td:first-child').allTextContents()
  expect(symbols).toEqual(['AAA', 'BBB'])
})

test('respects the region preset filter', async ({ page }) => {
  await page.goto('/data-status')

  await setRegionPreset(page, 'US')

  const accountTable = page.locator('table').first()
  await expect(accountTable.locator('tbody tr')).toHaveCount(2)
  await expect(accountTable.getByText('Nubank — Corretora')).not.toBeVisible()

  const tickerTable = page.locator('table').nth(1)
  const symbols = await tickerTable.locator('tbody tr td:first-child').allTextContents()
  expect(symbols).toEqual(['AAA', 'BBB'])
})

test('loads and renders without console or page errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/data-status')
  await expect(page.getByRole('heading', { name: 'Data Status' })).toBeVisible()

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
