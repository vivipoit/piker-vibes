import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { Currency } from '../utils/currency'

interface DisplayCurrencyState {
  displayCurrency: Currency
  setDisplayCurrency: (currency: Currency) => void
}

const DisplayCurrencyContext = createContext<DisplayCurrencyState | null>(null)

// One global "which currency am I looking at" toggle (money-bag 💰 in the
// header). Every page converts whatever it shows into this currency using
// the fx rate from FxRateContext - this is real conversion, distinct from
// AccountFilterContext which decides which accounts' data is even included.
export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('USD')
  return (
    <DisplayCurrencyContext.Provider value={{ displayCurrency, setDisplayCurrency }}>
      {children}
    </DisplayCurrencyContext.Provider>
  )
}

export function useDisplayCurrency() {
  const ctx = useContext(DisplayCurrencyContext)
  if (!ctx) throw new Error('useDisplayCurrency must be used within a DisplayCurrencyProvider')
  return ctx
}
