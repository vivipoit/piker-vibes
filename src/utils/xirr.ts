export interface CashFlow {
  date: string // ISO YYYY-MM-DD
  amount: number // negative = money invested, positive = money returned
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

function yearsSince(t0: number, date: string): number {
  return (new Date(date).getTime() - t0) / MS_PER_YEAR
}

function npv(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, yearsSince(t0, f.date)), 0)
}

function dNpv(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((sum, f) => {
    const years = yearsSince(t0, f.date)
    return sum - (years * f.amount) / Math.pow(1 + rate, years + 1)
  }, 0)
}

// Money-weighted annualized rate of return (a.k.a. personal rate of
// return) for a series of dated cash flows - the same metric brokerages
// use, and the correct one to compare against a retirement-planning growth
// assumption (5%, 7%, 10%/year) since it accounts for *when* money went in,
// not just how much. Solved via Newton-Raphson first (fast, precise for the
// well-behaved "invest over time, one terminal payout" shape this app's
// cash flows have), falling back to bisection if Newton fails to converge.
// Returns null if there aren't at least one inflow and one outflow to solve
// between, or if no root could be found.
export function xirr(flows: CashFlow[]): number | null {
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

  if (Number.isFinite(rate) && rate > -1 && Math.abs(npv(rate, sorted, t0)) < tolerance) {
    return rate
  }

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
