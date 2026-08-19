// Shared fixture data for e2e tests. Deliberately small and hand-checkable —
// every page and control test in tests/e2e/{pages,controls} draws from this
// one dataset so the numbers stay consistent to reason about across files.
//
// Accounts: one US (Schwab, USD) and one Brasil (Nubank, BRL) account, so
// tests can exercise the region preset / per-account checkbox / currency
// conversion controls, not just single-account happy paths.
//
// Securities held, by symbol:
//   AAA (USD, equity, Schwab)  — bought then fully sold  -> realized gain, 2 dots
//   BBB (USD, equity, Schwab)  — bought and still held    -> unrealized position, 1 dot, pays a dividend
//   CCC (USD, etf)             — has price history, never transacted -> price line only, no dots
//   DDD (BRL, reit, Nubank)    — bought and still held, BRL-priced   -> currency conversion, pays a dividend
//   EEE (USD, equity, Schwab)  — held but has no price history       -> "excluded from chart" case

const DATES = [
  '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05',
  '2024-01-06', '2024-01-07', '2024-01-08', '2024-01-09', '2024-01-10',
]

function priceRows(symbol: string, startPrice: number, currency = 'USD'): string[] {
  return DATES.map((date, i) => `${symbol},${date},${(startPrice + i).toFixed(2)},${currency}`)
}

export const ACCOUNTS_CSV = [
  'account_id,bank,account_name,account_type,currency',
  'acc-us,Schwab,Brokerage,brokerage,USD',
  'acc-br,Nubank,Corretora,brokerage,BRL',
].join('\n')

export const SECURITIES_CSV = [
  'symbol,name,asset_type',
  'AAA,Alpha Corp,equity',
  'BBB,Beta Corp,equity',
  'CCC,Gamma Corp,etf',
  'DDD,Delta Corp,reit',
  'EEE,Epsilon Corp,equity',
].join('\n')

export const PRICES_CSV = [
  'symbol,date,close,currency',
  ...priceRows('AAA', 10),
  ...priceRows('BBB', 20),
  ...priceRows('CCC', 30),
  ...priceRows('DDD', 100, 'BRL'),
].join('\n')

export const TRANSACTIONS_CSV = [
  'account_id,date,action,symbol,quantity,price,fees,amount,currency,raw_action,raw_date',
  // AAA: bought then fully sold (Schwab/USD) — expect a buy dot, a sell dot,
  // and a realized gain of 150 - 110 = 40.
  'acc-us,2024-01-02,BUY,AAA,10,11.00,,-110.00,USD,Buy,01/02/2024',
  'acc-us,2024-01-06,SELL,AAA,10,15.00,,150.00,USD,Sell,01/06/2024',
  // BBB: bought and still held (Schwab/USD) — expect only a buy dot, plus a dividend.
  'acc-us,2024-01-03,BUY,BBB,5,22.00,,-110.00,USD,Buy,01/03/2024',
  'acc-us,2024-01-05,DIVIDEND,BBB,,,,2.50,USD,Dividend,01/05/2024',
  // CCC: never transacted — expect no dots, price line only.
  // DDD: priced in BRL, bought and held (Nubank/BRL) — currency conversion + dividend.
  'acc-br,2024-01-02,BUY,DDD,2,100.00,,-200.00,BRL,Buy,01/02/2024',
  'acc-br,2024-01-07,DIVIDEND,DDD,,,,15.00,BRL,Dividend,01/07/2024',
  // EEE: held but has no price history — exercises the "excluded" note.
  'acc-us,2024-01-02,BUY,EEE,3,5.00,,-15.00,USD,Buy,01/02/2024',
].join('\n')

export const CSV_FILES = [
  { name: 'accounts.csv', content: ACCOUNTS_CSV },
  { name: 'securities.csv', content: SECURITIES_CSV },
  { name: 'prices.csv', content: PRICES_CSV },
  { name: 'transactions.csv', content: TRANSACTIONS_CSV },
]
