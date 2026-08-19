import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_FX_RATE } from '../utils/currency'

interface FxRateState {
  fxRate: number
  setFxRate: (rate: number) => void
}

const FxRateContext = createContext<FxRateState | null>(null)

// One fx rate for the whole app (not a historical series) - lets a security
// priced in a different currency than the account holding it (e.g. NuBank
// Crypto: BRL account, USD-quoted BTC/ETH/LINK price history) get bridged
// consistently everywhere, the same way the app already bridges BRL/USD
// totals for display.
export function FxRateProvider({ children }: { children: ReactNode }) {
  const [fxRate, setFxRate] = useState(DEFAULT_FX_RATE)
  return <FxRateContext.Provider value={{ fxRate, setFxRate }}>{children}</FxRateContext.Provider>
}

export function useFxRate() {
  const ctx = useContext(FxRateContext)
  if (!ctx) throw new Error('useFxRate must be used within an FxRateProvider')
  return ctx
}
