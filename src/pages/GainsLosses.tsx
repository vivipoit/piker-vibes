import { useMemo, useState } from 'react'
import { Button, Card, Group, SimpleGrid, Stack, Table, Text, Title, Tooltip as MantineTooltip } from '@mantine/core'
import {
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import StatCard from '../components/StatCard'
import { useAccountFilter } from '../context/AccountFilterContext'
import { useCsvData } from '../context/CsvDataContext'
import { useDisplayCurrency } from '../context/DisplayCurrencyContext'
import { useFxRate } from '../context/FxRateContext'
import { getRows } from '../utils/csv'
import { convertCurrency, currencyPrefix } from '../utils/currency'
import { formatMoney } from '../utils/format'
import { computeSymbolLots, LOT_EPSILON } from '../utils/lots'

type View = 'unrealized' | 'realized'

interface RealizedResult {
  symbol: string
  currency: string
  realized: number
  costBasis: number
}

const REALIZED_EPSILON = 1e-6

function computeRealizedGainsLosses(transactionRows: Record<string, string>[]): RealizedResult[] {
  const positions = computeSymbolLots(transactionRows)
  const results: RealizedResult[] = []
  for (const pos of positions.values()) {
    if (Math.abs(pos.realized) > REALIZED_EPSILON) {
      results.push({ symbol: pos.symbol, currency: pos.currency, realized: pos.realized, costBasis: pos.realizedCostBasis })
    }
  }
  return results
}

function formatPercent(value: number, costBasis: number) {
  if (costBasis <= LOT_EPSILON) return null
  const pct = (value / costBasis) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

// Latest close per symbol (by date), used to value currently open lots.
function latestPricesBySymbol(priceRows: Record<string, string>[]) {
  const latest = new Map<string, { date: string; close: number; currency: string }>()
  for (const row of priceRows) {
    const close = Number(row.close)
    if (Number.isNaN(close)) continue
    const existing = latest.get(row.symbol)
    if (!existing || row.date > existing.date) {
      latest.set(row.symbol, { date: row.date, close, currency: row.currency })
    }
  }
  return latest
}

interface UnrealizedPosition {
  symbol: string
  currency: string
  costBasis: number
  marketValue: number
  unrealized: number
}

function computeUnrealizedPositions(
  transactionRows: Record<string, string>[],
  priceRows: Record<string, string>[],
  fxRate: number
): UnrealizedPosition[] {
  const positions = computeSymbolLots(transactionRows)
  const latestPrices = latestPricesBySymbol(priceRows)
  const results: UnrealizedPosition[] = []
  for (const pos of positions.values()) {
    if (pos.openQuantity <= LOT_EPSILON) continue
    const price = latestPrices.get(pos.symbol)
    if (!price) continue
    // A security's price history isn't always quoted in the same currency
    // as the position holding it (e.g. NuBank Crypto: BRL account, USD
    // price history) - bridge with the global fx rate before combining.
    const close = convertCurrency(price.close, price.currency, pos.currency, fxRate)
    const marketValue = pos.openQuantity * close
    results.push({
      symbol: pos.symbol,
      currency: pos.currency,
      costBasis: pos.openCostBasis,
      marketValue,
      unrealized: marketValue - pos.openCostBasis,
    })
  }
  return results
}

interface BubblePoint {
  symbol: string
  x: number // unrealized $ gain/loss, in the selected display currency
  y: number // unrealized % gain/loss
  z: number // % of portfolio (by current market value)
}

function BubbleTooltip({ active, payload, currencyPrefix }: { active?: boolean; payload?: { payload: BubblePoint }[]; currencyPrefix: string }) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload
  return (
    <Card withBorder padding="xs" radius="sm" shadow="sm">
      <Text size="sm" fw={600}>{p.symbol}</Text>
      <Text size="xs" c={p.x >= 0 ? 'teal' : 'red'}>
        {formatMoney(p.x, currencyPrefix)} ({p.y >= 0 ? '+' : ''}{p.y.toFixed(1)}%)
      </Text>
      <Text size="xs" c="dimmed">{p.z.toFixed(1)}% of portfolio</Text>
    </Card>
  )
}

export default function GainsLosses() {
  const { files, loading } = useCsvData()
  const { fxRate } = useFxRate()
  const { displayCurrency } = useDisplayCurrency()
  const { filterByAccount } = useAccountFilter()
  const [view, setView] = useState<View>('unrealized')

  const allTransactionRows = useMemo(() => getRows(files, 'transactions.csv'), [files])
  const transactionRows = useMemo(
    () => filterByAccount(allTransactionRows),
    [allTransactionRows, filterByAccount]
  )
  const priceRows = useMemo(() => getRows(files, 'prices.csv'), [files])
  const securityRows = useMemo(() => getRows(files, 'securities.csv'), [files])
  const names = useMemo(() => new Map(securityRows.map((r) => [r.symbol, r.name])), [securityRows])

  const allResults = useMemo(() => computeRealizedGainsLosses(transactionRows), [transactionRows])

  const { gains, losses, totalGains, totalLosses } = useMemo(() => {
    const converted = allResults.map((r) => ({
      ...r,
      realized: convertCurrency(r.realized, r.currency, displayCurrency, fxRate),
      costBasis: convertCurrency(r.costBasis, r.currency, displayCurrency, fxRate),
    }))
    const gainRows = converted.filter((r) => r.realized > 0).sort((a, b) => b.realized - a.realized)
    const lossRows = converted.filter((r) => r.realized < 0).sort((a, b) => a.realized - b.realized)
    return {
      gains: gainRows,
      losses: lossRows,
      totalGains: gainRows.reduce((sum, r) => sum + r.realized, 0),
      totalLosses: lossRows.reduce((sum, r) => sum + r.realized, 0),
    }
  }, [allResults, displayCurrency, fxRate])

  const bubbleData = useMemo(() => {
    const positions = computeUnrealizedPositions(transactionRows, priceRows, fxRate)
    const converted = positions.map((p) => ({
      symbol: p.symbol,
      marketValue: convertCurrency(p.marketValue, p.currency, displayCurrency, fxRate),
      unrealized: convertCurrency(p.unrealized, p.currency, displayCurrency, fxRate),
      pct: p.costBasis > LOT_EPSILON ? (p.unrealized / p.costBasis) * 100 : 0,
    }))

    const total = converted.reduce((sum, p) => sum + p.marketValue, 0)

    const points: BubblePoint[] = converted
      .filter((p) => p.marketValue > LOT_EPSILON)
      .map((p) => ({
        symbol: p.symbol,
        x: p.unrealized,
        y: p.pct,
        z: total > LOT_EPSILON ? (p.marketValue / total) * 100 : 0,
      }))

    return points
  }, [transactionRows, priceRows, displayCurrency, fxRate])

  const bubbleDataByPct = useMemo(
    () => [...bubbleData].sort((a, b) => b.y - a.y),
    [bubbleData]
  )

  const prefix = currencyPrefix(displayCurrency)

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>G/L</Title>
        <Button
          variant="default"
          onClick={() => setView(view === 'unrealized' ? 'realized' : 'unrealized')}
        >
          {view === 'unrealized' ? 'Realized' : 'Back to Unrealized'}
        </Button>
      </Group>

      {loading && <Text c="dimmed">Loading…</Text>}

      {!loading && view === 'unrealized' && (
        <>
          {bubbleData.length === 0 && (
            <Text c="dimmed">No open positions with price history yet.</Text>
          )}

          {bubbleData.length > 0 && (
            <Card withBorder padding="lg" radius="md">
              <ResponsiveContainer width="100%" height={560}>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Gain/Loss"
                    tickFormatter={(value) => formatMoney(value, prefix)}
                    label={{ value: `Unrealized Gain/Loss (${prefix})`, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="% Gain/Loss"
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    label={{ value: '% Gain/Loss', angle: -90, position: 'insideLeft' }}
                  />
                  <ZAxis type="number" dataKey="z" range={[100, 3000]} name="% of Portfolio" />
                  <ReferenceLine x={0} stroke="var(--mantine-color-gray-5)" />
                  <ReferenceLine y={0} stroke="var(--mantine-color-gray-5)" />
                  <Tooltip content={<BubbleTooltip currencyPrefix={prefix} />} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={bubbleData} fillOpacity={0.45} strokeOpacity={0.6}>
                    {bubbleData.map((p) => (
                      <Cell key={p.symbol} fill={p.x >= 0 ? '#2f9e44' : '#e03131'} stroke={p.x >= 0 ? '#2f9e44' : '#e03131'} />
                    ))}
                    <LabelList dataKey="symbol" position="top" fill="var(--mantine-color-text)" style={{ fontSize: 11 }} />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </Card>
          )}

          {bubbleDataByPct.length > 0 && (
            <Card withBorder padding="lg" radius="md" mt="lg">
              <Table striped highlightOnHover verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ticker</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th ta="right">% Gain/Loss</Table.Th>
                    <Table.Th ta="right">Gain/Loss</Table.Th>
                    <Table.Th ta="right">% of Portfolio</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {bubbleDataByPct.map((p) => (
                    <Table.Tr key={p.symbol}>
                      <Table.Td fw={600}>{p.symbol}</Table.Td>
                      <Table.Td c="dimmed">{names.get(p.symbol) ?? '—'}</Table.Td>
                      <Table.Td ta="right" fw={700} c={p.y >= 0 ? 'teal' : 'red'}>
                        {p.y >= 0 ? '+' : ''}{p.y.toFixed(1)}%
                      </Table.Td>
                      <Table.Td ta="right" c="dimmed">{formatMoney(p.x, prefix)}</Table.Td>
                      <Table.Td ta="right">{p.z.toFixed(1)}%</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {!loading && view === 'realized' && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }} mb="xl">
            <StatCard label="Total Realized Gains" value={formatMoney(totalGains, prefix)} color="teal" />
            <StatCard label="Total Realized Losses" value={formatMoney(totalLosses, prefix)} color="red" />
            <StatCard label="Net Realized" value={formatMoney(totalGains + totalLosses, prefix)} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder padding="lg" radius="md">
              <Text fw={500} mb="sm">Realized Gains</Text>
              {gains.length === 0 && <Text c="dimmed" size="sm">No realized gains.</Text>}
              <Stack gap={4}>
                {gains.map((r) => (
                  <Group key={r.symbol} justify="space-between" wrap="nowrap">
                    <MantineTooltip label={names.get(r.symbol)} disabled={!names.has(r.symbol)} openDelay={300}>
                      <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                        {r.symbol}
                      </Text>
                    </MantineTooltip>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" fw={600} c="teal">{formatMoney(r.realized, prefix)}</Text>
                      {formatPercent(r.realized, r.costBasis) && (
                        <Text size="xs" c="dimmed">{formatPercent(r.realized, r.costBasis)}</Text>
                      )}
                    </Group>
                  </Group>
                ))}
              </Stack>
            </Card>

            <Card withBorder padding="lg" radius="md">
              <Text fw={500} mb="sm">Realized Losses</Text>
              {losses.length === 0 && <Text c="dimmed" size="sm">No realized losses.</Text>}
              <Stack gap={4}>
                {losses.map((r) => (
                  <Group key={r.symbol} justify="space-between" wrap="nowrap">
                    <MantineTooltip label={names.get(r.symbol)} disabled={!names.has(r.symbol)} openDelay={300}>
                      <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                        {r.symbol}
                      </Text>
                    </MantineTooltip>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" fw={600} c="red">{formatMoney(r.realized, prefix)}</Text>
                      {formatPercent(r.realized, r.costBasis) && (
                        <Text size="xs" c="dimmed">{formatPercent(r.realized, r.costBasis)}</Text>
                      )}
                    </Group>
                  </Group>
                ))}
              </Stack>
            </Card>
          </SimpleGrid>
        </>
      )}
    </>
  )
}
