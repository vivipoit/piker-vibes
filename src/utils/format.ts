export function formatMoney(value: number, prefix: string) {
  return `${value < 0 ? '-' : ''}${prefix}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
