export type Region = 'US' | 'BR'

// accounts.csv has no explicit country field, but currency and region are
// 1:1 in this data set - every USD account is US-based (Schwab, Ally, TSP)
// and every BRL account is Brasil-based (NuBank, Ágora) - so region is
// derived from currency rather than duplicating it as separate data.
export function accountRegion(currency: string): Region {
  return currency === 'BRL' ? 'BR' : 'US'
}
