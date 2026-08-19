import { useMemo } from 'react'
import { SimpleGrid, Table, Text, Title } from '@mantine/core'
import StatCard from '../components/StatCard'
import { useAccountFilter } from '../context/AccountFilterContext'
import { useCsvData } from '../context/CsvDataContext'
import { useDisplayCurrency } from '../context/DisplayCurrencyContext'
import { useFxRate } from '../context/FxRateContext'
import { getRows } from '../utils/csv'
import { convertCurrency, currencyPrefix } from '../utils/currency'
import { formatMoney } from '../utils/format'
import { computeSymbolLots, LOT_EPSILON } from '../utils/lots'

interface DividendResult {
  symbol: string
  currency: string
  totalReceived: number
  last12moReceived: number
  avgCost: number | null
  yieldLast12mo: number | null
}

function twelveMonthsAgo(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

// Groups DIVIDEND rows by symbol, then pairs the trailing-12-month total
// against the average cost basis of the shares currently held (from FIFO lot
// tracking) to get a trailing yield-on-cost figure. Symbols with no open
// position (fully sold) get a null yield/avg cost since neither is
// meaningful without held shares.
function computeDividends(transactionRows: Record<string, string>[]): DividendResult[] {
  const positions = computeSymbolLots(transactionRows)
  const cutoff = twelveMonthsAgo()

  const totals = new Map<string, { amount: number; last12mo: number; currency: string }>()
  for (const row of transactionRows) {
    if (row.action !== 'DIVIDEND' || !row.symbol) continue
    const amount = Number(row.amount)
    if (Number.isNaN(amount)) continue
    const entry = totals.get(row.symbol) ?? { amount: 0, last12mo: 0, currency: row.currency }
    entry.amount += amount
    if (row.date >= cutoff) entry.last12mo += amount
    totals.set(row.symbol, entry)
  }

  const results: DividendResult[] = []
  for (const [symbol, { amount, last12mo, currency }] of totals) {
    const pos = positions.get(symbol)
    const hasOpenLots = pos !== undefined && pos.openQuantity > LOT_EPSILON
    const avgCost = hasOpenLots ? pos!.openCostBasis / pos!.openQuantity : null
    const yieldLast12mo = hasOpenLots && pos!.openCostBasis > LOT_EPSILON ? (last12mo / pos!.openCostBasis) * 100 : null
    results.push({ symbol, currency, totalReceived: amount, last12moReceived: last12mo, avgCost, yieldLast12mo })
  }

  return results.sort((a, b) => b.totalReceived - a.totalReceived)
}

export default function Dividends() {
  const { files, loading } = useCsvData()
  const { fxRate } = useFxRate()
  const { displayCurrency } = useDisplayCurrency()
  const { filterByAccount } = useAccountFilter()

  const allTransactionRows = useMemo(() => getRows(files, 'transactions.csv'), [files])
  const transactionRows = useMemo(
    () => filterByAccount(allTransactionRows),
    [allTransactionRows, filterByAccount]
  )
  const securityRows = useMemo(() => getRows(files, 'securities.csv'), [files])
  const names = useMemo(() => new Map(securityRows.map((r) => [r.symbol, r.name])), [securityRows])

  const allResults = useMemo(() => computeDividends(transactionRows), [transactionRows])

  const { payers, total, last12moTotal } = useMemo(() => {
    const converted = allResults
      .map((r) => ({
        ...r,
        totalReceived: convertCurrency(r.totalReceived, r.currency, displayCurrency, fxRate),
        last12moReceived: convertCurrency(r.last12moReceived, r.currency, displayCurrency, fxRate),
        avgCost: r.avgCost !== null ? convertCurrency(r.avgCost, r.currency, displayCurrency, fxRate) : null,
      }))
      .sort((a, b) => b.totalReceived - a.totalReceived)
    return {
      payers: converted,
      total: converted.reduce((sum, r) => sum + r.totalReceived, 0),
      last12moTotal: converted.reduce((sum, r) => sum + r.last12moReceived, 0),
    }
  }, [allResults, displayCurrency, fxRate])

  const avgPerMonth = last12moTotal / 12

  const prefix = currencyPrefix(displayCurrency)

  return (
    <>
      <Title order={2} mb="md">Dividends</Title>

      {loading && <Text c="dimmed">Loading…</Text>}

      {!loading && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }} mb="xl">
            <StatCard label="Total Dividends Received" value={formatMoney(total, prefix)} color="teal" />
            <StatCard label="Last 12 Months" value={formatMoney(last12moTotal, prefix)} color="teal" />
            <StatCard label="Average per Month (Last 12 Mo.)" value={formatMoney(avgPerMonth, prefix)} color="teal" />
          </SimpleGrid>

          <Text fw={500} mb="sm">Top Dividend Payers</Text>
          {payers.length === 0 && <Text c="dimmed" size="sm">No dividends received.</Text>}
          {payers.length > 0 && (
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ticker</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th ta="right">Total Received</Table.Th>
                  <Table.Th ta="right">Last 12 Months</Table.Th>
                  <Table.Th ta="right">Yield (TTM)</Table.Th>
                  <Table.Th ta="right">Avg Cost</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {payers.map((r) => (
                  <Table.Tr key={r.symbol}>
                    <Table.Td fw={600}>{r.symbol}</Table.Td>
                    <Table.Td c="dimmed">{names.get(r.symbol) ?? '—'}</Table.Td>
                    <Table.Td ta="right" fw={600} c="teal">{formatMoney(r.totalReceived, prefix)}</Table.Td>
                    <Table.Td ta="right">{formatMoney(r.last12moReceived, prefix)}</Table.Td>
                    <Table.Td ta="right">{r.yieldLast12mo !== null ? `${r.yieldLast12mo.toFixed(1)}%` : '—'}</Table.Td>
                    <Table.Td ta="right">{r.avgCost !== null ? formatMoney(r.avgCost, prefix) : '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}
    </>
  )
}
