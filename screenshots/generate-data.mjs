// Generates the synthetic dummy dataset used for the public screenshots in
// this directory. Entirely fictional accounts/securities - not real market
// data. Re-run after tweaking the specs below:
//
//   node screenshots/generate-data.mjs
//
// It writes screenshots/data/{accounts,securities,prices,transactions}.csv
// and prints a summary (total value, dividends, annualized return, etc.) so
// you can check the numbers before re-running the screenshot capture.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'data')

const TODAY = '2026-08-19'
const FX_RATE = 5 // BRL per USD - matches DEFAULT_FX_RATE in src/utils/currency.ts

function isoDate(daysAgo) {
  const d = new Date(TODAY + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - Math.round(daysAgo))
  return d.toISOString().slice(0, 10)
}
function usDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}/${y}`
}

// ---- xirr, ported from src/utils/xirr.ts, used here only to check the
// generated data lands close to the target annualized return. ----
function yearsSince(t0, date) {
  return (new Date(date).getTime() - t0) / (365 * 24 * 60 * 60 * 1000)
}
function npv(rate, flows, t0) {
  return flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, yearsSince(t0, f.date)), 0)
}
function dNpv(rate, flows, t0) {
  return flows.reduce((sum, f) => {
    const years = yearsSince(t0, f.date)
    return sum - (years * f.amount) / Math.pow(1 + rate, years + 1)
  }, 0)
}
function xirr(flows) {
  const sorted = flows
    .filter((f) => Number.isFinite(f.amount) && f.amount !== 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  if (sorted.length < 2) return null
  if (!sorted.some((f) => f.amount < 0) || !sorted.some((f) => f.amount > 0)) return null
  const t0 = new Date(sorted[0].date).getTime()
  const scale = sorted.reduce((sum, f) => sum + Math.abs(f.amount), 0) / sorted.length
  const tolerance = Math.max(scale * 1e-9, 1e-6)
  let rate = 0.1
  for (let i = 0; i < 50; i++) {
    const f = npv(rate, sorted, t0)
    const df = dNpv(rate, sorted, t0)
    if (Math.abs(df) < 1e-9) break
    const next = rate - f / df
    if (!Number.isFinite(next) || next <= -1) break
    rate = next
    if (Math.abs(f) < tolerance) break
  }
  if (Number.isFinite(rate) && rate > -1 && Math.abs(npv(rate, sorted, t0)) < tolerance) return rate
  let lo = -0.999
  let hi = 10
  let fLo = npv(lo, sorted, t0)
  const fHi = npv(hi, sorted, t0)
  if (fLo * fHi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid, sorted, t0)
    if (Math.abs(fMid) < tolerance) return mid
    if ((fLo < 0) === (fMid < 0)) {
      lo = mid
      fLo = fMid
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}

// ---- seeded RNG (mulberry32) so re-runs are reproducible ----
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(42)

// Random-walk noise detrended to hit exact start/end values - gives a
// realistic wobble instead of a straight interpolated line.
function noisySeries(n, startVal, endVal, noiseAmp) {
  const raw = new Array(n).fill(0)
  for (let i = 1; i < n; i++) raw[i] = raw[i - 1] + (rng() - 0.5) * noiseAmp
  const rawEnd = raw[n - 1]
  const values = raw.map((v, i) => {
    const detrended = v - rawEnd * (i / (n - 1))
    const linear = startVal + (endVal - startVal) * (i / (n - 1))
    return Math.max(0.5, linear + detrended)
  })
  values[0] = startVal
  values[n - 1] = endVal
  return values.map((v) => Math.round(v * 100) / 100)
}

function linspace(a, b, n) {
  if (n === 1) return [a]
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1))
}

// ---------------------------------------------------------------------
// Accounts: 2 US (Schwab, Ally) + 1 Brasil (Ágora). US = 90% of portfolio.
// ---------------------------------------------------------------------
const ACCOUNTS = [
  { account_id: 'acc-schwab', bank: 'Schwab', account_name: 'Brokerage', account_type: 'brokerage', currency: 'USD' },
  { account_id: 'acc-ally', bank: 'Ally', account_name: 'Brokerage', account_type: 'brokerage', currency: 'USD' },
  { account_id: 'acc-agora', bank: 'Ágora', account_name: 'Investimentos', account_type: 'brokerage', currency: 'BRL' },
]

// All symbols/companies below are fictional.
const SECURITIES = {
  NVGX: ['Nova Genix Corp', 'equity'],
  MDLN: ['Meridian Holdings', 'equity'],
  STBL: ['Stabilus Group', 'equity'],
  QRTZ: ['Quartzcore Inc', 'equity'],
  FLKS: ['Falkirk ETF Trust', 'etf'],
  HRZN: ['Horizon Industries', 'equity'],
  CPWR: ['Cabot Power Corp', 'equity'],
  VNTR: ['Ventura Systems', 'equity'],
  AGRB: ['Agrobrasil Realty FII', 'reit'],
  TSVL: ['Tresville Participações', 'equity'],
  GRW: ['Growlyte Technologies', 'equity'],
  LSA: ['Lassen Materials', 'equity'],
  LSB: ['Larkspur Biotech', 'equity'],
  LSC: ['Litoral Consórcio', 'equity'],
}

// Currently-held positions (10 - satisfies "at least 9"). buyDaysAgo/points
// scale with the global timeline factor `k` (tuned below to hit the target
// annualized return); $ amounts do not change with k.
const HELD = [
  { symbol: 'NVGX', account: 'acc-schwab', currency: 'USD', qty: 31, buyPrice: 92.2, currentPrice: 130.0, buyDaysAgo: 380, points: 24 },
  { symbol: 'MDLN', account: 'acc-schwab', currency: 'USD', qty: 60, buyPrice: 30.49, currentPrice: 25.0, buyDaysAgo: 300, points: 20 },
  { symbol: 'STBL', account: 'acc-ally', currency: 'USD', qty: 15, buyPrice: 42.11, currentPrice: 40.0, buyDaysAgo: 430, points: 22 },
  { symbol: 'QRTZ', account: 'acc-ally', currency: 'USD', qty: 20, buyPrice: 33.98, currentPrice: 35.0, buyDaysAgo: 640, points: 28 },
  { symbol: 'FLKS', account: 'acc-schwab', currency: 'USD', qty: 50, buyPrice: 16.36, currentPrice: 18.0, buyDaysAgo: 520, points: 26 },
  { symbol: 'HRZN', account: 'acc-schwab', currency: 'USD', qty: 20, buyPrice: 69.57, currentPrice: 80.0, buyDaysAgo: 900, points: 36 },
  { symbol: 'CPWR', account: 'acc-ally', currency: 'USD', qty: 20, buyPrice: 55.56, currentPrice: 60.0, buyDaysAgo: 820, points: 34 },
  { symbol: 'VNTR', account: 'acc-schwab', currency: 'USD', qty: 26, buyPrice: 37.5, currentPrice: 45.0, buyDaysAgo: 760, points: 32 },
  { symbol: 'AGRB', account: 'acc-agora', currency: 'BRL', qty: 200, buyPrice: 17.86, currentPrice: 20.0, buyDaysAgo: 700, points: 30 },
  { symbol: 'TSVL', account: 'acc-agora', currency: 'BRL', qty: 100, buyPrice: 25.51, currentPrice: 25.0, buyDaysAgo: 260, points: 18 },
]

// 3 realized losses (also scale with k).
const REALIZED_LOSSES = [
  { symbol: 'LSA', account: 'acc-ally', currency: 'USD', qty: 20, buyPrice: 50.0, sellPrice: 42.0, buyDaysAgo: 500, sellDaysAgo: 440, points: 8 },
  { symbol: 'LSB', account: 'acc-schwab', currency: 'USD', qty: 40, buyPrice: 30.0, sellPrice: 25.5, buyDaysAgo: 650, sellDaysAgo: 560, points: 10 },
  { symbol: 'LSC', account: 'acc-agora', currency: 'BRL', qty: 100, buyPrice: 40.0, sellPrice: 33.0, buyDaysAgo: 340, sellDaysAgo: 250, points: 10 },
]

// GRW: the 1 realized gain, and the security selected for the Price History
// screenshot. Its window is fixed (not scaled by k) - 90 daily points from
// $11 to $24 with noise, owned for only the middle stretch (start + finish
// markers, volume bars on both ends).
const GRW_WINDOW_START_DAYS_AGO = 480
const GRW_NUM_POINTS = 90
const GRW_BUY_INDEX = 20 // day 460 ago
const GRW_SELL_INDEX = 70 // day 410 ago
const GRW_QTY = 50

// Dividend payers among the held positions. Dates spread evenly between the
// position's buy date and ~25 days ago (scaled by k).
const DIVIDENDS = [
  { symbol: 'HRZN', account: 'acc-schwab', currency: 'USD', total: 175, count: 7 },
  { symbol: 'CPWR', account: 'acc-ally', currency: 'USD', total: 140, count: 7 },
  { symbol: 'VNTR', account: 'acc-schwab', currency: 'USD', total: 108, count: 6 },
  { symbol: 'QRTZ', account: 'acc-ally', currency: 'USD', total: 60, count: 6 },
  { symbol: 'STBL', account: 'acc-ally', currency: 'USD', total: 40, count: 5 },
  { symbol: 'AGRB', account: 'acc-agora', currency: 'BRL', total: 720, count: 12 },
  { symbol: 'TSVL', account: 'acc-agora', currency: 'BRL', total: 160, count: 4 },
]

function round2(n) {
  return Math.round(n * 100) / 100
}

function build(k) {
  const transactions = []
  const prices = []

  function addBuy(symbol, account, currency, date, qty, price) {
    transactions.push({
      account_id: account,
      date,
      action: 'BUY',
      symbol,
      quantity: qty,
      price,
      fees: '',
      amount: round2(-qty * price),
      currency,
      raw_action: 'Buy',
      raw_date: usDate(date),
    })
  }
  function addSell(symbol, account, currency, date, qty, price) {
    transactions.push({
      account_id: account,
      date,
      action: 'SELL',
      symbol,
      quantity: qty,
      price,
      fees: '',
      amount: round2(qty * price),
      currency,
      raw_action: 'Sell',
      raw_date: usDate(date),
    })
  }
  function addDividend(symbol, account, currency, date, amount) {
    transactions.push({
      account_id: account,
      date,
      action: 'DIVIDEND',
      symbol,
      quantity: '',
      price: '',
      fees: '',
      amount: round2(amount),
      currency,
      raw_action: 'Dividend',
      raw_date: usDate(date),
    })
  }
  function addPrice(symbol, date, close, currency) {
    prices.push({ symbol, date, close, currency })
  }

  // Held positions.
  for (const h of HELD) {
    const buyDaysAgo = h.buyDaysAgo * k
    const buyDate = isoDate(buyDaysAgo)
    addBuy(h.symbol, h.account, h.currency, buyDate, h.qty, h.buyPrice)

    const offsets = linspace(buyDaysAgo, 0, h.points)
    const noiseAmp = Math.max(0.15, (h.currentPrice - h.buyPrice) * 0.06)
    const series = noisySeries(h.points, h.buyPrice, h.currentPrice, noiseAmp)
    offsets.forEach((off, i) => addPrice(h.symbol, isoDate(off), series[i], h.currency))
  }

  // Realized losses.
  for (const r of REALIZED_LOSSES) {
    const buyDaysAgo = r.buyDaysAgo * k
    const sellDaysAgo = r.sellDaysAgo * k
    const buyDate = isoDate(buyDaysAgo)
    const sellDate = isoDate(sellDaysAgo)
    addBuy(r.symbol, r.account, r.currency, buyDate, r.qty, r.buyPrice)
    addSell(r.symbol, r.account, r.currency, sellDate, r.qty, r.sellPrice)

    const offsets = linspace(buyDaysAgo, sellDaysAgo, r.points)
    const noiseAmp = Math.max(0.15, Math.abs(r.sellPrice - r.buyPrice) * 0.08)
    const series = noisySeries(r.points, r.buyPrice, r.sellPrice, noiseAmp)
    offsets.forEach((off, i) => addPrice(r.symbol, isoDate(off), series[i], r.currency))
  }

  // GRW: fixed window, not scaled by k.
  {
    const offsets = []
    for (let i = 0; i < GRW_NUM_POINTS; i++) offsets.push(GRW_WINDOW_START_DAYS_AGO - i)
    const series = noisySeries(GRW_NUM_POINTS, 11.0, 24.0, 0.9)
    offsets.forEach((off, i) => addPrice('GRW', isoDate(off), series[i], 'USD'))

    const buyDate = isoDate(offsets[GRW_BUY_INDEX])
    const sellDate = isoDate(offsets[GRW_SELL_INDEX])
    const buyPrice = series[GRW_BUY_INDEX]
    const sellPrice = series[GRW_SELL_INDEX]
    addBuy('GRW', 'acc-schwab', 'USD', buyDate, GRW_QTY, buyPrice)
    addSell('GRW', 'acc-schwab', 'USD', sellDate, GRW_QTY, sellPrice)
  }

  // Dividends.
  for (const div of DIVIDENDS) {
    const held = HELD.find((h) => h.symbol === div.symbol)
    const startDaysAgo = held.buyDaysAgo * k
    const endDaysAgo = 25 * k
    const offsets = linspace(startDaysAgo, endDaysAgo, div.count)
    const per = round2(div.total / div.count)
    let running = 0
    offsets.forEach((off, i) => {
      const amount = i === div.count - 1 ? round2(div.total - running) : per
      running = round2(running + amount)
      addDividend(div.symbol, div.account, div.currency, isoDate(off), amount)
    })
  }

  // ---- XIRR check (matches Dashboard.tsx's buildCashFlows + terminal value) ----
  const CASH_FLOW_ACTIONS = new Set(['BUY', 'SELL', 'DIVIDEND'])
  const toUSD = (amount, currency) => (currency === 'BRL' ? amount / FX_RATE : amount)
  const flows = transactions
    .filter((t) => CASH_FLOW_ACTIONS.has(t.action))
    .map((t) => ({ date: t.date, amount: toUSD(t.amount, t.currency) }))

  const totalValueUSD = HELD.reduce((sum, h) => {
    const usd = h.currency === 'BRL' ? (h.qty * h.currentPrice) / FX_RATE : h.qty * h.currentPrice
    return sum + usd
  }, 0)
  flows.push({ date: TODAY, amount: totalValueUSD })

  const rate = xirr(flows)
  return { transactions, prices, rate, totalValueUSD }
}

// ---- bisect k so the annualized return lands close to 6.8% ----
const TARGET_RATE = 0.068
let lo = 0.15
let hi = 4.0
let best = build(1)
for (let i = 0; i < 40; i++) {
  const mid = (lo + hi) / 2
  const result = build(mid)
  if (result.rate === null) break
  best = result
  best.k = mid
  // Larger k -> longer horizon -> lower annualized return for the same gain.
  if (result.rate > TARGET_RATE) {
    lo = mid
  } else {
    hi = mid
  }
  if (Math.abs(result.rate - TARGET_RATE) < 0.0005) break
}

const { transactions, prices, rate, totalValueUSD, k } = best

// ---- write CSVs ----
fs.mkdirSync(OUT_DIR, { recursive: true })

function toCsv(rows, header) {
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(header.map((key) => row[key]).join(','))
  }
  return lines.join('\n') + '\n'
}

fs.writeFileSync(
  path.join(OUT_DIR, 'accounts.csv'),
  toCsv(ACCOUNTS, ['account_id', 'bank', 'account_name', 'account_type', 'currency']),
)
fs.writeFileSync(
  path.join(OUT_DIR, 'securities.csv'),
  toCsv(
    Object.entries(SECURITIES).map(([symbol, [name, asset_type]]) => ({ symbol, name, asset_type })),
    ['symbol', 'name', 'asset_type'],
  ),
)
fs.writeFileSync(
  path.join(OUT_DIR, 'prices.csv'),
  toCsv(
    prices.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : a.date < b.date ? -1 : 1)),
    ['symbol', 'date', 'close', 'currency'],
  ),
)
fs.writeFileSync(
  path.join(OUT_DIR, 'transactions.csv'),
  toCsv(
    transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    ['account_id', 'date', 'action', 'symbol', 'quantity', 'price', 'fees', 'amount', 'currency', 'raw_action', 'raw_date'],
  ),
)

// ---- summary ----
const divTotal = transactions
  .filter((t) => t.action === 'DIVIDEND')
  .reduce((sum, t) => sum + (t.currency === 'BRL' ? t.amount / FX_RATE : t.amount), 0)

console.log(`k = ${k.toFixed(4)}`)
console.log(`Total value (USD) = $${totalValueUSD.toFixed(2)}`)
console.log(`Total dividends (USD) = $${divTotal.toFixed(2)}`)
console.log(`Annualized return (XIRR) = ${(rate * 100).toFixed(2)}%`)
console.log(`Transactions: ${transactions.length}, price rows: ${prices.length}`)
