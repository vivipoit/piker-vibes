import type { DonutChartCell } from '@mantine/charts'
import { accountRegion, type Region } from './accounts'
import { convertCurrency } from './currency'
import { computeSymbolLots, LOT_EPSILON } from './lots'

export interface NamedAmount {
  name: string
  value: number
}

// Caps an open-ended breakdown (per symbol, per account, ...) at this many
// slices, folding the rest into a single "Other" wedge so the chart/legend
// stay readable.
export const MAX_SLICES = 8

// Rotating palette for open-ended breakdowns (one slice per symbol). Fixed
// categories (region, asset class) get their own stable colors below instead,
// so the same category always reads the same color across reloads/filters.
export const SYMBOL_COLORS = [
  'blue.6', 'teal.6', 'grape.6', 'orange.6', 'red.6', 'indigo.6',
  'lime.6', 'cyan.6', 'pink.6', 'yellow.6', 'violet.6', 'green.6',
]
export const OTHER_COLOR = 'gray.5'

export const REGION_META: Record<Region, { label: string; color: string }> = {
  US: { label: 'US', color: 'blue.6' },
  BR: { label: 'Brasil', color: 'green.6' },
}

export const ASSET_TYPE_META: Record<string, { label: string; color: string }> = {
  equity: { label: 'Stocks', color: 'blue.6' },
  etf: { label: 'ETFs', color: 'grape.6' },
  crypto: { label: 'Crypto', color: 'orange.6' },
  reit: { label: 'REITs/FIIs', color: 'teal.6' },
  fixed_income: { label: 'Bonds', color: 'indigo.6' },
  fund: { label: 'Funds', color: 'cyan.6' },
  right: { label: 'Rights', color: 'gray.6' },
}
export const OTHER_ASSET_TYPE = { label: 'Other', color: 'gray.4' }

// Latest close per symbol (by date), used to value currently open lots.
export function latestPricesBySymbol(priceRows: Record<string, string>[]) {
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

export function computeHoldingsBreakdown(
  transactionRows: Record<string, string>[],
  priceRows: Record<string, string>[],
  securityRows: Record<string, string>[],
  displayCurrency: string,
  fxRate: number
) {
  const positions = computeSymbolLots(transactionRows)
  const latestPrices = latestPricesBySymbol(priceRows)
  const assetTypeBySymbol = new Map(securityRows.map((r) => [r.symbol, r.asset_type]))

  const byRegion = new Map<Region, number>()
  const byAssetType = new Map<string, number>()
  const bySymbol: NamedAmount[] = []

  for (const pos of positions.values()) {
    if (pos.openQuantity <= LOT_EPSILON) continue
    const price = latestPrices.get(pos.symbol)
    if (!price) continue
    const close = convertCurrency(price.close, price.currency, pos.currency, fxRate)
    const marketValue = convertCurrency(pos.openQuantity * close, pos.currency, displayCurrency, fxRate)
    if (marketValue <= 0) continue

    const region = accountRegion(pos.currency)
    byRegion.set(region, (byRegion.get(region) ?? 0) + marketValue)

    const assetType = assetTypeBySymbol.get(pos.symbol) || 'other'
    byAssetType.set(assetType, (byAssetType.get(assetType) ?? 0) + marketValue)

    bySymbol.push({ name: pos.symbol, value: marketValue })
  }

  bySymbol.sort((a, b) => b.value - a.value)

  return { byRegion, byAssetType, bySymbol }
}

// Current per-account quantity, computed by summing signed transaction
// deltas directly (not via computeSymbolLots' pooled FIFO matching, which by
// design merges every account's lots for a symbol - see lots.ts). Only the
// net quantity is needed here (not cost basis), and TRANSFER_INTERNAL rows
// already carry a signed quantity on each side of an account move, so a
// plain per-account sum lands on the correct current position per account.
function computeQuantityByAccountAndSymbol(transactionRows: Record<string, string>[]) {
  const byAccount = new Map<string, Map<string, number>>()
  for (const row of transactionRows) {
    if (!row.symbol || !row.quantity || !row.account_id) continue
    const quantity = Number(row.quantity)
    if (Number.isNaN(quantity)) continue
    const delta = row.action === 'SELL' || row.action === 'CASH_IN_LIEU' ? -quantity : quantity
    const bySymbol = byAccount.get(row.account_id) ?? new Map<string, number>()
    bySymbol.set(row.symbol, (bySymbol.get(row.symbol) ?? 0) + delta)
    byAccount.set(row.account_id, bySymbol)
  }
  return byAccount
}

export function computeHoldingsByAccount(
  transactionRows: Record<string, string>[],
  priceRows: Record<string, string>[],
  accountRows: Record<string, string>[],
  displayCurrency: string,
  fxRate: number
): NamedAmount[] {
  const latestPrices = latestPricesBySymbol(priceRows)
  const quantities = computeQuantityByAccountAndSymbol(transactionRows)
  const byAccount: NamedAmount[] = []

  for (const account of accountRows) {
    const bySymbol = quantities.get(account.account_id)
    if (!bySymbol) continue
    let total = 0
    for (const [symbol, quantity] of bySymbol) {
      if (quantity <= LOT_EPSILON) continue
      const price = latestPrices.get(symbol)
      if (!price) continue
      const close = convertCurrency(price.close, price.currency, account.currency, fxRate)
      total += convertCurrency(quantity * close, account.currency, displayCurrency, fxRate)
    }
    if (total > 0) byAccount.push({ name: `${account.bank} — ${account.account_name}`, value: total })
  }

  byAccount.sort((a, b) => b.value - a.value)
  return byAccount
}

export function mapToDonutData(
  map: Map<string, number>,
  meta: Record<string, { label: string; color: string }>,
  fallback: { label: string; color: string }
): DonutChartCell[] {
  return [...map.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => {
      const m = meta[key] ?? { label: key ? key[0].toUpperCase() + key.slice(1) : fallback.label, color: fallback.color }
      return { name: m.label, value, color: m.color }
    })
}

export function toCappedDonutData(items: NamedAmount[]): DonutChartCell[] {
  const top = items.slice(0, MAX_SLICES).map((it, idx) => ({
    name: it.name,
    value: it.value,
    color: SYMBOL_COLORS[idx % SYMBOL_COLORS.length],
  }))
  const rest = items.slice(MAX_SLICES)
  if (rest.length === 0) return top
  return [...top, { name: `Other (${rest.length})`, value: rest.reduce((sum, it) => sum + it.value, 0), color: OTHER_COLOR }]
}
