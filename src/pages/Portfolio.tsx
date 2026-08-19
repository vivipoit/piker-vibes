import { useMemo } from 'react'
import { Card, Text, Title } from '@mantine/core'
import { AreaChart } from '@mantine/charts'
import { useAccountFilter } from '../context/AccountFilterContext'
import { useCsvData } from '../context/CsvDataContext'
import { useDisplayCurrency } from '../context/DisplayCurrencyContext'
import { useFxRate } from '../context/FxRateContext'
import { getRows } from '../utils/csv'
import { convertCurrency, currencyPrefix } from '../utils/currency'

const COLORS = [
  'blue.6', 'teal.6', 'grape.6', 'orange.6', 'red.6', 'indigo.6',
  'lime.6', 'cyan.6', 'pink.6', 'yellow.6', 'violet.6', 'green.6',
]

function computeQuantityTimeline(transactionRows: Record<string, string>[], symbol: string) {
  const byDate = new Map<string, number>()

  for (const row of transactionRows) {
    if (row.symbol !== symbol || !row.quantity) continue
    const quantity = Number(row.quantity)
    if (Number.isNaN(quantity)) continue
    const delta = row.action === 'SELL' || row.action === 'CASH_IN_LIEU' ? -quantity : quantity
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + delta)
  }

  const dates = [...byDate.keys()].sort()
  const timeline: { date: string; quantity: number }[] = []
  let cumulative = 0
  for (const date of dates) {
    cumulative += byDate.get(date)!
    timeline.push({ date, quantity: cumulative })
  }
  return timeline
}

// Forward-fills a sorted-by-date series onto a (sorted, superset) list of dates.
function forwardFill(dates: string[], series: { date: string; value: number }[]) {
  const result = new Array<number>(dates.length).fill(0)
  let cursor = 0
  let current = 0
  for (let i = 0; i < dates.length; i++) {
    while (cursor < series.length && series[cursor].date <= dates[i]) {
      current = series[cursor].value
      cursor++
    }
    result[i] = current
  }
  return result
}

export default function Portfolio() {
  const { files, loading } = useCsvData()
  const { fxRate } = useFxRate()
  const { displayCurrency } = useDisplayCurrency()
  const { filterByAccount } = useAccountFilter()

  const priceRows = useMemo(() => getRows(files, 'prices.csv'), [files])
  const allTransactionRows = useMemo(() => getRows(files, 'transactions.csv'), [files])
  const transactionRows = useMemo(
    () => filterByAccount(allTransactionRows),
    [allTransactionRows, filterByAccount]
  )

  const { chartData, series, missingPriceSymbols } = useMemo(() => {
    const pricesBySymbol = new Map<string, { date: string; close: number; currency: string }[]>()
    for (const row of priceRows) {
      const close = Number(row.close)
      if (Number.isNaN(close)) continue
      const list = pricesBySymbol.get(row.symbol) ?? []
      list.push({ date: row.date, close, currency: row.currency })
      pricesBySymbol.set(row.symbol, list)
    }
    for (const list of pricesBySymbol.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    const everHeldSymbols = new Set(
      transactionRows.filter((r) => r.symbol && r.quantity).map((r) => r.symbol)
    )

    const heldSymbols = [...everHeldSymbols].filter((s) => pricesBySymbol.has(s))
    const missing = [...everHeldSymbols].filter((s) => !pricesBySymbol.has(s)).sort()

    const globalDates = [...new Set(heldSymbols.flatMap((s) => pricesBySymbol.get(s)!.map((p) => p.date)))].sort()

    const symbolValues = heldSymbols.map((symbol) => {
      const priceSeries = pricesBySymbol.get(symbol)!
      const priceCurrency = priceSeries[0]?.currency ?? 'USD'
      const priceFill = forwardFill(globalDates, priceSeries.map((p) => ({ date: p.date, value: p.close })))
      const quantityFill = forwardFill(
        globalDates,
        computeQuantityTimeline(transactionRows, symbol).map((t) => ({ date: t.date, value: t.quantity }))
      )
      const values = globalDates.map((_, i) =>
        convertCurrency(priceFill[i] * quantityFill[i], priceCurrency, displayCurrency, fxRate)
      )
      return { symbol, values, total: values[values.length - 1] ?? 0 }
    })

    symbolValues.sort((a, b) => b.total - a.total)

    const data = globalDates.map((date, i) => {
      const point: Record<string, unknown> = { date }
      for (const sv of symbolValues) point[sv.symbol] = sv.values[i]
      return point
    })

    const chartSeries = symbolValues.map((sv, idx) => ({
      name: sv.symbol,
      color: COLORS[idx % COLORS.length],
    }))

    return { chartData: data, series: chartSeries, missingPriceSymbols: missing }
  }, [priceRows, transactionRows, displayCurrency, fxRate])

  const prefix = currencyPrefix(displayCurrency)

  return (
    <>
      <Title order={2} mb="md">Portfolio</Title>

      {loading && <Text c="dimmed">Loading…</Text>}

      {!loading && chartData.length === 0 && (
        <Text c="dimmed">No priced holdings found. Add price history and transactions to see the portfolio chart.</Text>
      )}

      {!loading && chartData.length > 0 && (
        <Card withBorder padding="lg" radius="md">
          <AreaChart
            h={480}
            data={chartData}
            dataKey="date"
            type="stacked"
            withDots={false}
            curveType="linear"
            withLegend
            legendProps={{ layout: 'vertical', align: 'right', verticalAlign: 'middle' }}
            styles={{ legend: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' } }}
            valueFormatter={(value) => `${prefix}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            series={series}
          />
        </Card>
      )}

      {missingPriceSymbols.length > 0 && (
        <Text size="xs" c="dimmed" mt="sm">
          Excluded from chart (no price history yet): {missingPriceSymbols.join(', ')}.
        </Text>
      )}
    </>
  )
}
