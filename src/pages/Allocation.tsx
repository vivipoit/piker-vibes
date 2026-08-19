import { useMemo } from 'react'
import { SimpleGrid, Text, Title } from '@mantine/core'
import DonutWithLegend from '../components/DonutWithLegend'
import { useAccountFilter } from '../context/AccountFilterContext'
import { useCsvData } from '../context/CsvDataContext'
import { useDisplayCurrency } from '../context/DisplayCurrencyContext'
import { useFxRate } from '../context/FxRateContext'
import { getRows } from '../utils/csv'
import { convertCurrency, currencyPrefix } from '../utils/currency'
import { computeSymbolLots } from '../utils/lots'
import {
  ASSET_TYPE_META,
  computeHoldingsByAccount,
  computeHoldingsBreakdown,
  mapToDonutData,
  OTHER_ASSET_TYPE,
  REGION_META,
  toCappedDonutData,
  type NamedAmount,
} from '../utils/allocation'

const REALIZED_EPSILON = 1e-6

function computeRealizedBySymbol(
  transactionRows: Record<string, string>[],
  displayCurrency: string,
  fxRate: number
) {
  const positions = computeSymbolLots(transactionRows)
  const gains: NamedAmount[] = []
  const losses: NamedAmount[] = []

  for (const pos of positions.values()) {
    if (Math.abs(pos.realized) <= REALIZED_EPSILON) continue
    const value = convertCurrency(pos.realized, pos.currency, displayCurrency, fxRate)
    if (value > 0) gains.push({ name: pos.symbol, value })
    else losses.push({ name: pos.symbol, value: -value })
  }

  gains.sort((a, b) => b.value - a.value)
  losses.sort((a, b) => b.value - a.value)
  return { gains, losses }
}

export default function Allocation() {
  const { files, loading } = useCsvData()
  const { fxRate } = useFxRate()
  const { displayCurrency } = useDisplayCurrency()
  const { accountRows, filterByAccount } = useAccountFilter()

  const allTransactionRows = useMemo(() => getRows(files, 'transactions.csv'), [files])
  const transactionRows = useMemo(
    () => filterByAccount(allTransactionRows),
    [allTransactionRows, filterByAccount]
  )
  const priceRows = useMemo(() => getRows(files, 'prices.csv'), [files])
  const securityRows = useMemo(() => getRows(files, 'securities.csv'), [files])

  const { byRegion, byAssetType, bySymbol } = useMemo(
    () => computeHoldingsBreakdown(transactionRows, priceRows, securityRows, displayCurrency, fxRate),
    [transactionRows, priceRows, securityRows, displayCurrency, fxRate]
  )

  const byAccount = useMemo(
    () => computeHoldingsByAccount(transactionRows, priceRows, accountRows, displayCurrency, fxRate),
    [transactionRows, priceRows, accountRows, displayCurrency, fxRate]
  )

  const { gains, losses } = useMemo(
    () => computeRealizedBySymbol(transactionRows, displayCurrency, fxRate),
    [transactionRows, displayCurrency, fxRate]
  )

  const regionData = useMemo(() => mapToDonutData(byRegion, REGION_META, OTHER_ASSET_TYPE), [byRegion])
  const accountData = useMemo(() => toCappedDonutData(byAccount), [byAccount])
  const assetTypeData = useMemo(() => mapToDonutData(byAssetType, ASSET_TYPE_META, OTHER_ASSET_TYPE), [byAssetType])
  const assetData = useMemo(() => toCappedDonutData(bySymbol), [bySymbol])
  const gainsData = useMemo(() => toCappedDonutData(gains), [gains])
  const lossesData = useMemo(() => toCappedDonutData(losses), [losses])

  const prefix = currencyPrefix(displayCurrency)

  return (
    <>
      <Title order={2} mb="md">Allocation</Title>

      {loading && <Text c="dimmed">Loading…</Text>}

      {!loading && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <DonutWithLegend title="Holdings by Region" data={regionData} prefix={prefix} />
          <DonutWithLegend title="Holdings by Account" data={accountData} prefix={prefix} />
          <DonutWithLegend title="Holdings by Asset Class" data={assetTypeData} prefix={prefix} />
          <DonutWithLegend title="Holdings by Asset" data={assetData} prefix={prefix} />
          <DonutWithLegend title="Realized Gains by Asset" data={gainsData} prefix={prefix} />
          <DonutWithLegend title="Realized Losses by Asset" data={lossesData} prefix={prefix} />
        </SimpleGrid>
      )}
    </>
  )
}
