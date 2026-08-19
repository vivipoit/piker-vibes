import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useCsvData } from './CsvDataContext'
import { getRows } from '../utils/csv'

interface AccountFilterState {
  accountRows: Record<string, string>[]
  activeAccountIds: string[]
  toggleAccount: (accountId: string) => void
  setAccountIds: (accountIds: string[]) => void
  // Filters transactions.csv rows down to the active accounts. A no-op when
  // accounts.csv itself isn't loaded (e.g. e2e fixtures that only stub
  // securities/prices/transactions) - there's no account data to filter by,
  // so nothing should disappear.
  filterByAccount: (rows: Record<string, string>[]) => Record<string, string>[]
}

const AccountFilterContext = createContext<AccountFilterState | null>(null)

// One global "which accounts count" filter (globe 🌐 in the header), backed
// by a checkbox per account that defaults to all-checked. The US/Brasil
// quick actions in the header are just a one-shot bulk check/uncheck on
// this same list, not a separate persistent mode - individual accounts stay
// freely toggleable afterward. Every page filters transactions.csv rows by
// `activeAccountIds` before computing anything, so this is a pure inclusion
// filter, distinct from DisplayCurrencyContext's conversion.
export function AccountFilterProvider({ children }: { children: ReactNode }) {
  const { files } = useCsvData()
  const accountRows = useMemo(() => getRows(files, 'accounts.csv'), [files])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[] | null>(null)

  // null means "not yet initialized" - defaults to all accounts once loaded.
  useEffect(() => {
    if (selectedAccountIds === null && accountRows.length > 0) {
      setSelectedAccountIds(accountRows.map((a) => a.account_id))
    }
  }, [accountRows, selectedAccountIds])

  const activeAccountIds = selectedAccountIds ?? accountRows.map((a) => a.account_id)

  const toggleAccount = (accountId: string) => {
    setSelectedAccountIds((prev) => {
      const current = prev ?? accountRows.map((a) => a.account_id)
      return current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId]
    })
  }

  const filterByAccount = (rows: Record<string, string>[]): Record<string, string>[] => {
    if (accountRows.length === 0) return rows
    return rows.filter((r) => activeAccountIds.includes(r.account_id))
  }

  return (
    <AccountFilterContext.Provider
      value={{ accountRows, activeAccountIds, toggleAccount, setAccountIds: setSelectedAccountIds, filterByAccount }}
    >
      {children}
    </AccountFilterContext.Provider>
  )
}

export function useAccountFilter() {
  const ctx = useContext(AccountFilterContext)
  if (!ctx) throw new Error('useAccountFilter must be used within an AccountFilterProvider')
  return ctx
}
