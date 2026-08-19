export interface Lot {
  quantity: number
  unitCost: number
}

export interface SymbolLotResult {
  symbol: string
  currency: string
  realized: number
  realizedCostBasis: number
  soldQuantity: number
  openQuantity: number
  openCostBasis: number
}

export const LOT_EPSILON = 1e-9

const SYMBOL_ACTIONS = new Set(['BUY', 'SELL', 'SPLIT', 'RIGHTS', 'CASH_IN_LIEU'])

// FIFO lot matching per symbol. SPLIT rows are corporate actions (no cash
// impact) that resize existing lots in place; RIGHTS rows behave like a
// zero-cost BUY/SELL pair when issued/expired; CASH_IN_LIEU has no tracked
// cost basis, so the whole payout counts as realized. Lots remaining after
// processing all rows are the currently open position (quantity + average
// cost) for that symbol.
export function computeSymbolLots(transactionRows: Record<string, string>[]): Map<string, SymbolLotResult> {
  const bySymbol = new Map<string, Record<string, string>[]>()
  for (const row of transactionRows) {
    if (!row.symbol || !SYMBOL_ACTIONS.has(row.action)) continue
    const list = bySymbol.get(row.symbol) ?? []
    list.push(row)
    bySymbol.set(row.symbol, list)
  }

  const results = new Map<string, SymbolLotResult>()

  for (const [symbol, rows] of bySymbol) {
    const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const currency = sorted.find((r) => r.currency)?.currency ?? 'USD'

    const splitTotalsByDate = new Map<string, number>()
    for (const row of sorted) {
      if (row.action !== 'SPLIT') continue
      const qty = Number(row.quantity)
      if (Number.isNaN(qty)) continue
      splitTotalsByDate.set(row.date, (splitTotalsByDate.get(row.date) ?? 0) + qty)
    }
    const appliedSplitDates = new Set<string>()

    const lots: Lot[] = []
    let realized = 0
    let realizedCostBasis = 0
    let soldQuantity = 0

    for (const row of sorted) {
      const quantity = Number(row.quantity)
      const amount = row.amount ? Number(row.amount) : NaN

      if (row.action === 'BUY' || (row.action === 'RIGHTS' && quantity > 0)) {
        if (Number.isNaN(quantity) || quantity <= 0) continue
        const cost = !Number.isNaN(amount) ? -amount : quantity * Number(row.price || 0) + Number(row.fees || 0)
        lots.push({ quantity, unitCost: cost / quantity })
      } else if (row.action === 'SELL' || (row.action === 'RIGHTS' && quantity < 0)) {
        let sellQty = Math.abs(quantity)
        if (Number.isNaN(sellQty) || sellQty <= 0) continue
        soldQuantity += sellQty
        const proceeds = !Number.isNaN(amount) ? amount : sellQty * Number(row.price || 0) - Number(row.fees || 0)
        let costBasisConsumed = 0
        while (sellQty > LOT_EPSILON && lots.length > 0) {
          const lot = lots[0]
          const take = Math.min(lot.quantity, sellQty)
          costBasisConsumed += take * lot.unitCost
          lot.quantity -= take
          sellQty -= take
          if (lot.quantity <= LOT_EPSILON) lots.shift()
        }
        realized += proceeds - costBasisConsumed
        realizedCostBasis += costBasisConsumed
      } else if (row.action === 'CASH_IN_LIEU') {
        if (!Number.isNaN(amount)) realized += amount
        // No tracked cost basis for the fractional shares cashed out (the
        // full payout above is already booked as pure realized profit), but
        // when a quantity is given (not every broker reports one), shrink
        // the open position so it doesn't linger as phantom dust forever.
        if (!Number.isNaN(quantity) && quantity > 0) {
          let remaining = quantity
          while (remaining > LOT_EPSILON && lots.length > 0) {
            const lot = lots[0]
            const take = Math.min(lot.quantity, remaining)
            lot.quantity -= take
            remaining -= take
            if (lot.quantity <= LOT_EPSILON) lots.shift()
          }
        }
      } else if (row.action === 'SPLIT') {
        if (appliedSplitDates.has(row.date)) continue
        appliedSplitDates.add(row.date)
        const netDelta = splitTotalsByDate.get(row.date) ?? 0
        const totalBefore = lots.reduce((sum, lot) => sum + lot.quantity, 0)
        const ratio = (totalBefore + netDelta) / totalBefore
        if (totalBefore > LOT_EPSILON && netDelta !== 0 && ratio > 0) {
          for (const lot of lots) {
            lot.quantity *= ratio
            lot.unitCost /= ratio
          }
        }
      }
    }

    const openQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0)
    const openCostBasis = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0)

    results.set(symbol, { symbol, currency, realized, realizedCostBasis, soldQuantity, openQuantity, openCostBasis })
  }

  return results
}
