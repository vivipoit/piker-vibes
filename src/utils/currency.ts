export type Currency = "USD" | "BRL";

export const DEFAULT_FX_RATE = 5;

export function currencyPrefix(currency: Currency): string {
  return `${currency} $ `;
}

// Converts a value quoted in `from` into `to`, using a single global fx
// rate (BRL per USD) rather than a historical per-date rate - see
// FxRateContext.
export function convertCurrency(
  value: number,
  from: string,
  to: string,
  fxRate: number,
): number {
  if (from === to || !from || !to) return value;
  if (from === "USD" && to === "BRL") return value * fxRate;
  if (from === "BRL" && to === "USD") return value / fxRate;
  return value;
}
