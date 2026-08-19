import type { Locator, Page } from '@playwright/test'
import { CSV_FILES } from './fixtures/csv-data'

export async function mockCsvData(page: Page, files = CSV_FILES): Promise<void> {
  await page.route('**/api/csv-files', (route) => route.fulfill({ json: files }))
}

export async function selectSecurity(page: Page, label: string): Promise<void> {
  const select = page.getByPlaceholder('Select a security')
  await select.click()
  await page.getByRole('option', { name: label }).click()
}

// The header's currency SegmentedControl (USD/BRL) — its radio inputs are
// visually hidden by Mantine, so interact via the visible label text instead
// of .check()/.click() on the input. `hasText: 'USD'` disambiguates it from
// the account region-preset SegmentedControl inside the Accounts popover,
// which also contains the substring "US".
export function currencyControl(page: Page): Locator {
  return page.locator('[role="radiogroup"]').filter({ hasText: 'USD' })
}

export async function setDisplayCurrency(page: Page, currency: 'USD' | 'BRL'): Promise<void> {
  await currencyControl(page).getByText(currency, { exact: true }).click()
}

export async function openAccountsPopover(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /Accounts/ })
  // Popover.Target toggles on click - avoid re-closing it if already open.
  if ((await button.getAttribute('aria-expanded')) === 'true') return
  await button.click()
}

// The region-preset SegmentedControl (All/Brasil/US) inside the Accounts
// popover - only present once the popover is open.
export function regionPresetControl(page: Page): Locator {
  return page.locator('[role="radiogroup"]').filter({ hasText: 'Brasil' })
}

export async function setRegionPreset(page: Page, preset: 'All' | 'Brasil' | 'US'): Promise<void> {
  await openAccountsPopover(page)
  await regionPresetControl(page).getByText(preset, { exact: true }).click()
}

export async function toggleAccount(page: Page, accountLabel: string): Promise<void> {
  await openAccountsPopover(page)
  await page.getByRole('checkbox', { name: accountLabel }).click()
}

export function fxRateInput(page: Page): Locator {
  return page.getByLabel('Exchange rate (BRL per USD)')
}

export async function applyFxRate(page: Page, rate: string): Promise<void> {
  await fxRateInput(page).fill(rate)
  await page.getByRole('button', { name: 'Apply exchange rate' }).click()
}

// Donut legends (DonutWithLegend) render one <p> per slice name. Chart
// libraries also keep a same-named tooltip node in the DOM (hidden until
// hover), so a plain text locator is ambiguous - scope to the legend's <p>
// tags and match the whole name to avoid strict-mode violations.
export function legendItem(scope: Locator, name: string): Locator {
  return scope.locator('p', { hasText: new RegExp(`^${name}$`) })
}
