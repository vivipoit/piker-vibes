import { expect, test } from '@playwright/test'
import { fxRateInput, mockCsvData, setDisplayCurrency } from '../helpers'

test.beforeEach(async ({ page }) => {
  await mockCsvData(page)
})

test('renders a stacked area chart with an area per held, priced security', async ({ page }) => {
  await page.goto('/portfolio')

  await expect(page.locator('.recharts-wrapper')).toBeVisible()
  // AAA (sold out), BBB, and DDD were held and have price data — CCC was never held.
  // Legend shows tickers only, not security names.
  await expect(page.getByText('AAA', { exact: true })).toBeVisible()
  await expect(page.getByText('BBB', { exact: true })).toBeVisible()
  await expect(page.getByText('DDD', { exact: true })).toBeVisible()
  await expect(page.getByText('CCC', { exact: true })).not.toBeVisible()
  await expect(page.getByText('Alpha Corp')).not.toBeVisible()
})

test('lays out the legend as a vertical list on the right', async ({ page }) => {
  await page.goto('/portfolio')

  const aaa = page.locator('.mantine-ChartLegend-legendItem', { hasText: 'AAA' })
  const bbb = page.locator('.mantine-ChartLegend-legendItem', { hasText: 'BBB' })
  await expect(aaa).toBeVisible()
  await expect(bbb).toBeVisible()

  const aaaBox = await aaa.boundingBox()
  const bbbBox = await bbb.boundingBox()
  const chartBox = await page.locator('.recharts-wrapper').boundingBox()
  if (!aaaBox || !bbbBox || !chartBox) throw new Error('expected bounding boxes')

  // Vertical list: stacked items share an x position but differ in y.
  expect(Math.abs(aaaBox.x - bbbBox.x)).toBeLessThan(2)
  expect(aaaBox.y).not.toBe(bbbBox.y)
  // On the right: legend sits in the right half of the chart.
  expect(aaaBox.x).toBeGreaterThan(chartBox.x + chartBox.width / 2)
})

test('notes securities that were held but have no price history', async ({ page }) => {
  await page.goto('/portfolio')

  await expect(page.getByText('Excluded from chart (no price history yet): EEE.')).toBeVisible()
})

test('defaults to USD and converts BRL-priced holdings using the default 5:1 rate', async ({ page }) => {
  await page.goto('/portfolio')

  await expect(fxRateInput(page)).toHaveValue('5')
  const yAxisTicks = page.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value')
  await expect(yAxisTicks.first()).toBeVisible()
  await expect(yAxisTicks.first()).toContainText('$')
})

test('switches to BRL and back, updating the axis currency prefix', async ({ page }) => {
  await page.goto('/portfolio')

  await setDisplayCurrency(page, 'BRL')
  const yAxisTicks = page.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value')
  await expect(yAxisTicks.first()).toContainText('BRL $')

  await setDisplayCurrency(page, 'USD')
  await expect(yAxisTicks.first()).toContainText('USD $')
  await expect(yAxisTicks.first()).not.toContainText('BRL $')
})

test('only re-applies a new exchange rate after clicking Apply', async ({ page }) => {
  await page.goto('/portfolio')
  await setDisplayCurrency(page, 'BRL')

  const yAxisTicks = page.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value')
  const beforeTexts = await yAxisTicks.allTextContents()

  await fxRateInput(page).fill('10')
  // Not applied yet — chart should be unchanged.
  await expect(yAxisTicks.first()).toHaveText(beforeTexts[0])

  await page.getByRole('button', { name: 'Apply exchange rate' }).click()
  const afterTexts = await yAxisTicks.allTextContents()
  expect(afterTexts).not.toEqual(beforeTexts)
})

test('loads and renders without console or page errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/portfolio')
  await expect(page.locator('.recharts-wrapper')).toBeVisible()

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
