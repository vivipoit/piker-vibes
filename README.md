# 📈 Piker Vibes

A local-only React app for tracking my own investment portfolio. I built this for myself, to fill needs I couldn't find in one place.

## The Why

I manage my own portfolio across a mix of account types. I have play money I use to test ideas, a 401(k), a TSP, and a handful of brokerage accounts. I wanted one central place to see all of it instead of stitching it together from a pile of separate broker apps each time. Because I do hold a small position in Brazil, a global view requires handling a second currency and a second set of market conventions along with the US and USD defaults.

Beyond just seeing balances, I wanted a tool that helps me actually get _better_ at investing. I craved a way to track which calls were good so I repeat them more confidently, and which were bad so I avoid them. Most broker apps show you a number going up or down. They don't help you build a memory of your decisions.

This is a single-user, local-only tool. There's no server and no auth. It reads CSV files from disk and renders components based on them. It is not intended to manage anyone's data but mine.

## Features

- **Dashboard**  
  The core overview. The handful of numbers I want to see first, every time, without digging.
- **Allocation**  
  A quick visual read of where the money actually sits, so it's obvious at a glance which risks are most concentrated.
- **Portfolio**  
  Overall growth and proportions together, not just one or the other. Filtered to a single account, it helps me see which assets make up the most of _that_ account, or which ones have stalled. It's useful for account-level decisions, not just the whole-portfolio view.
- **G/L (bubble chart)**  
  My favorite feature in the whole app! 🤩 Inspired by a gains/losses view on Schwab's mobile app. I love the feature, and none of my other institutions have it. I have formally requested the feature from each one multiple times via support tickets. This global version here has been a dream come true!
- **G/L Realized**  
  My second favorite. A place for lessons learned. What are the wins worth repeating (and sizing up next time), and the known mistakes that should be avoided?
- **Dividends**  
  How I think about passive income today and how I want to shape it going forward. It keeps me honest about "growth" positions growing and "income" positions paying.
- **Price History**  
  Did I actually buy low and sell high, or was it the other way around? Did I sell too early because what looked like a top was actually just the beginning? This is where I check my own timing instincts against what really happened.
- **Data Status**  
  An internal health check on the data pipeline itself. Are data points missing? Have prices become stale? Etc. Because everything is static at this point, a place to check in easily helps.
- **Cross-page controls in the header**  
  An account filter (with All/Brazil/US region presets), a USD/BRL display-currency toggle, and an editable exchange rate used for the conversion (defaults to 5, because that's easy).

## How it works

```
data-chaotic/     →     scripts/build-data.mjs     →     data/              →     app
(raw exports,           (parse, normalize,               (clean CSVs              (reads CSVs and renders)
 gitignored)            validate, and merge)             the app reads,
                                                          gitignored)
```

Everything upstream of `data/` (raw broker exports, parsing scripts, actual holdings) is gitignored and never touched git history. What's checked in is just the app: React + TypeScript, reading CSVs at runtime. No backend, no database, no accounts, no telemetry.

A few decisions worth calling out:

- **Reconciliation over trust.**  
  Broker exports are messier than they look. One recurring class of bug: a price-history provider will silently re-scale a ticker's _entire_ history after a stock split (including dates from before the split happened) while the broker's own transaction history only reflects the real share count as of the split's actual recorded date. Pairing "already adjusted" prices with "not-yet-split" share counts silently inflates or deflates portfolio value for every date before the split, and it can be quiet enough to miss the first pass. One ticker in my data had two separate splits baked into one export, and the first fix only caught the more obvious one. The build pipeline treats this as a class of bug to actively check for, not something to patch reactively.
- **Tests as a standing rule, not a follow-up.**  
  Every page and every cross-page control has end-to-end coverage (Playwright), organized by what it's testing rather than dumped in one flat folder. The rule is that a change that touches page behavior ships with its test update in the _same_ change. I avoid "I'll add tests later" while vibe coding, because things move quickly and test files can easily rot. Testing discipline keeps vibe coding effective through fast iterations, large and small.
- **Approximations are labeled, not hidden.**  
  Not everything in the data has a clean, real-time market price. Fixed-income positions I hold to maturity, for instance, are estimated from their contractual accrual rather than a live tradeable quote. A live quote would show volatility I don't actually experience. Where the app estimates instead of reporting a hard number, that's a deliberate choice. It's documented and not presented as fact.

## Stack

- Vite + React + TypeScript
- [Mantine](https://mantine.dev/) for UI and charts
- [Recharts](https://recharts.org/) for the bubble chart
- Playwright for e2e tests
- CSV parsing via PapaParse
- Broker PDF/XLSX exports parsed with `pdf-parse` and `xlsx` in the build script

## Running it

This repo ships without the `data/` it needs. It's a personal tool. My actual holdings never leave my machine. To run it against your own data, you'd need to shape CSVs matching the schemas the app expects (`accounts.csv`, `securities.csv`, `transactions.csv`, `prices.csv`) and drop them in `data/`.

```
npm install
npm run dev        # starts the app at localhost:5173
npm run test:e2e   # Playwright suite, runs against fixture data
```
