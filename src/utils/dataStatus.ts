import { computeSymbolLots, LOT_EPSILON } from './lots'

export type FreshnessStatus = 'none' | 'stale' | 'aging' | 'current'

export const STATUS_LABEL: Record<FreshnessStatus, string> = {
  none: 'No Data',
  stale: 'Stale',
  aging: 'Aging',
  current: 'Current',
}

export const STATUS_COLOR: Record<FreshnessStatus, string> = {
  none: 'gray',
  stale: 'red',
  aging: 'yellow',
  current: 'green',
}

// Whole calendar days between an ISO date string and `now`, computed on UTC
// day boundaries so callers don't get an off-by-one from local timezone
// offsets on date-only strings like "2026-08-01".
export function daysSince(dateStr: string, now: Date): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dateMs = Date.UTC(y, m - 1, d)
  const nowMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((nowMs - dateMs) / 86400000)
}

// 1 week or less is the ok/"current" state; 1 week to 1 month is "aging";
// 1 month (30 days) or more is "stale". A null age (no date at all) is its
// own "none" state, distinct from stale.
export function statusForAge(ageDays: number | null): FreshnessStatus {
  if (ageDays === null) return 'none'
  if (ageDays >= 30) return 'stale'
  if (ageDays > 7) return 'aging'
  return 'current'
}

export interface AccountStatus {
  accountId: string
  label: string
  lastTransactionDate: string | null
  ageDays: number | null
  status: FreshnessStatus
}

export function computeAccountStatuses(
  accountRows: Record<string, string>[],
  transactionRows: Record<string, string>[],
  now: Date,
): AccountStatus[] {
  const lastDateByAccount = new Map<string, string>()
  for (const row of transactionRows) {
    if (!row.account_id || !row.date) continue
    const existing = lastDateByAccount.get(row.account_id)
    if (!existing || row.date > existing) lastDateByAccount.set(row.account_id, row.date)
  }

  return accountRows
    .map((account) => {
      const lastTransactionDate = lastDateByAccount.get(account.account_id) ?? null
      const ageDays = lastTransactionDate === null ? null : daysSince(lastTransactionDate, now)
      return {
        accountId: account.account_id,
        label: `${account.bank} — ${account.account_name}`,
        lastTransactionDate,
        ageDays,
        status: statusForAge(ageDays),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

export interface TickerStatus {
  symbol: string
  name: string
  lastPriceDate: string | null
  ageDays: number | null
  status: FreshnessStatus
}

// Only currently-held symbols (open lots under the active account filter)
// are in scope - a fully-sold or never-owned security's price freshness
// doesn't affect anything this app computes.
export function computeTickerStatuses(
  transactionRows: Record<string, string>[],
  priceRows: Record<string, string>[],
  securityRows: Record<string, string>[],
  now: Date,
): TickerStatus[] {
  const names = new Map(securityRows.map((r) => [r.symbol, r.name]))

  const lastPriceBySymbol = new Map<string, string>()
  for (const row of priceRows) {
    if (!row.symbol || !row.date) continue
    const existing = lastPriceBySymbol.get(row.symbol)
    if (!existing || row.date > existing) lastPriceBySymbol.set(row.symbol, row.date)
  }

  const positions = computeSymbolLots(transactionRows)
  const heldSymbols = [...positions.values()]
    .filter((p) => p.openQuantity > LOT_EPSILON)
    .map((p) => p.symbol)

  return heldSymbols
    .map((symbol) => {
      const lastPriceDate = lastPriceBySymbol.get(symbol) ?? null
      const ageDays = lastPriceDate === null ? null : daysSince(lastPriceDate, now)
      return {
        symbol,
        name: names.get(symbol) ?? '',
        lastPriceDate,
        ageDays,
        status: statusForAge(ageDays),
      }
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}
