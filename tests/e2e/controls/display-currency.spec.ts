import { expect, test } from '@playwright/test'
import { currencyControl, mockCsvData, setDisplayCurrency } from '../helpers'

test.beforeEach(async ({ page }) => {
  await mockCsvData(page)
})

test('defaults to USD', async ({ page }) => {
  await page.goto('/dividends')

  await expect(currencyControl(page).getByRole('radio', { name: 'USD' })).toBeChecked()
  await expect(page.getByText('USD $ 5.50', { exact: true })).toBeVisible()
})

test('switching to BRL converts every money figure using the fx rate', async ({ page }) => {
  await page.goto('/dividends')

  await setDisplayCurrency(page, 'BRL')
  await expect(currencyControl(page).getByRole('radio', { name: 'BRL' })).toBeChecked()

  // BBB's USD 2.50 dividend -> BRL 12.50 at the default 5:1 rate; DDD's
  // native BRL 15.00 dividend is unchanged. Total: 27.50.
  await expect(page.getByText('BRL $ 27.50', { exact: true })).toBeVisible()
  const rows = page.locator('table tbody tr')
  await expect(rows.nth(0)).toContainText('BRL $ 15.00')
  await expect(rows.nth(1)).toContainText('BRL $ 12.50')

  await setDisplayCurrency(page, 'USD')
  await expect(page.getByText('USD $ 5.50', { exact: true })).toBeVisible()
})
