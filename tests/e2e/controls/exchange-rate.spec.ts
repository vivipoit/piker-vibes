import { expect, test } from '@playwright/test'
import { applyFxRate, fxRateInput, mockCsvData, setDisplayCurrency } from '../helpers'

test.beforeEach(async ({ page }) => {
  await mockCsvData(page)
})

test('defaults to a 5:1 BRL-per-USD rate', async ({ page }) => {
  await page.goto('/dividends')

  await expect(fxRateInput(page)).toHaveValue('5')
  // DDD's native BRL 15.00 dividend converts to USD 3.00 at the default rate.
  await expect(page.getByText('USD $ 3.00', { exact: true })).toBeVisible()
})

test('typing a new rate does not apply until Apply is clicked', async ({ page }) => {
  await page.goto('/dividends')

  await fxRateInput(page).fill('10')
  await expect(page.getByText('USD $ 3.00', { exact: true })).toBeVisible()
  await expect(page.getByText('USD $ 1.50', { exact: true })).not.toBeVisible()
})

test('applying a new rate recomputes cross-currency conversions', async ({ page }) => {
  await page.goto('/dividends')

  await applyFxRate(page, '10')
  // DDD's native BRL 15.00 dividend now converts to USD 1.50; total 2.50 + 1.50 = 4.00.
  await expect(page.getByText('USD $ 1.50', { exact: true })).toBeVisible()
  await expect(page.getByText('USD $ 4.00', { exact: true })).toBeVisible()
})

test('the applied rate also governs the opposite conversion direction', async ({ page }) => {
  await page.goto('/dividends')

  await applyFxRate(page, '10')
  await setDisplayCurrency(page, 'BRL')
  // BBB's native USD 2.50 dividend now converts to BRL 25.00 at the 10:1 rate.
  await expect(page.getByText('BRL $ 25.00', { exact: true })).toBeVisible()
})
