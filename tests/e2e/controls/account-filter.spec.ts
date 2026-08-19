import { expect, test } from '@playwright/test'
import { legendItem, mockCsvData, openAccountsPopover, setRegionPreset, toggleAccount } from '../helpers'

test.beforeEach(async ({ page }) => {
  await mockCsvData(page)
})

test('defaults to every account selected, with no count badge', async ({ page }) => {
  await page.goto('/portfolio')

  await expect(page.getByRole('button', { name: '🌎 Accounts', exact: true })).toBeVisible()
  await openAccountsPopover(page)
  await expect(page.getByRole('checkbox', { name: 'Schwab — Brokerage' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Nubank — Corretora' })).toBeChecked()
})

test('unchecking an account hides its holdings and shows a count badge', async ({ page }) => {
  await page.goto('/portfolio')

  // DDD is only ever held in the Nubank account; AAA/BBB are Schwab-only.
  await expect(page.getByText('DDD', { exact: true })).toBeVisible()
  await toggleAccount(page, 'Nubank — Corretora')

  await expect(page.getByText('DDD', { exact: true })).not.toBeVisible()
  await expect(page.getByText('AAA', { exact: true })).toBeVisible()
  await expect(page.getByText('BBB', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '🌎 Accounts (1/2)' })).toBeVisible()
})

test('region presets bulk-select accounts by currency/region', async ({ page }) => {
  await page.goto('/portfolio')

  await setRegionPreset(page, 'Brasil')
  await expect(page.getByText('DDD', { exact: true })).toBeVisible()
  await expect(page.getByText('AAA', { exact: true })).not.toBeVisible()
  await expect(page.getByText('BBB', { exact: true })).not.toBeVisible()

  await setRegionPreset(page, 'US')
  await expect(page.getByText('DDD', { exact: true })).not.toBeVisible()
  await expect(page.getByText('AAA', { exact: true })).toBeVisible()
  await expect(page.getByText('BBB', { exact: true })).toBeVisible()

  await setRegionPreset(page, 'All')
  await expect(page.getByText('DDD', { exact: true })).toBeVisible()
  await expect(page.getByText('AAA', { exact: true })).toBeVisible()
  await expect(page.getByText('BBB', { exact: true })).toBeVisible()
})

test('the account filter applies across pages, e.g. the Dashboard region donut', async ({ page }) => {
  await page.goto('/')

  const region = page.locator('.mantine-Card-root', { hasText: 'Holdings by Region' })
  await expect(legendItem(region, 'US')).toBeVisible()
  await expect(legendItem(region, 'Brasil')).toBeVisible()

  await setRegionPreset(page, 'US')
  await expect(legendItem(region, 'Brasil')).not.toBeVisible()
  await expect(legendItem(region, 'US')).toBeVisible()
})
