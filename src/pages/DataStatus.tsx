import { useMemo } from 'react'
import { Badge, SimpleGrid, Table, Text, Title } from '@mantine/core'
import StatCard from '../components/StatCard'
import { useAccountFilter } from '../context/AccountFilterContext'
import { useCsvData } from '../context/CsvDataContext'
import { getRows } from '../utils/csv'
import {
  computeAccountStatuses,
  computeTickerStatuses,
  STATUS_COLOR,
  STATUS_LABEL,
  type FreshnessStatus,
} from '../utils/dataStatus'

function StatusBadge({ status }: { status: FreshnessStatus }) {
  return (
    <Badge color={STATUS_COLOR[status]} variant="light">
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export default function DataStatus() {
  const { files, loading } = useCsvData()
  const { accountRows, activeAccountIds, filterByAccount } = useAccountFilter()

  const allTransactionRows = useMemo(() => getRows(files, 'transactions.csv'), [files])
  const transactionRows = useMemo(
    () => filterByAccount(allTransactionRows),
    [allTransactionRows, filterByAccount],
  )
  const priceRows = useMemo(() => getRows(files, 'prices.csv'), [files])
  const securityRows = useMemo(() => getRows(files, 'securities.csv'), [files])

  const filteredAccountRows = useMemo(
    () => accountRows.filter((a) => activeAccountIds.includes(a.account_id)),
    [accountRows, activeAccountIds],
  )

  // `now` only needs to be stable within a render - recomputing it on every
  // render would shift ages by the odd millisecond and break memoization for
  // no benefit, since this page isn't live-ticking.
  const now = useMemo(() => new Date(), [])

  const accountStatuses = useMemo(
    () => computeAccountStatuses(filteredAccountRows, transactionRows, now),
    [filteredAccountRows, transactionRows, now],
  )
  const tickerStatuses = useMemo(
    () => computeTickerStatuses(transactionRows, priceRows, securityRows, now),
    [transactionRows, priceRows, securityRows, now],
  )

  const tickerCounts = useMemo(() => {
    const counts = { none: 0, stale: 0, aging: 0, current: 0 }
    for (const t of tickerStatuses) counts[t.status]++
    return counts
  }, [tickerStatuses])

  return (
    <>
      <Title order={2} mb="md">Data Status</Title>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="xl">
        <StatCard label="No Price Data" value={String(tickerCounts.none)} color="gray" />
        <StatCard label="Stale (1 month+)" value={String(tickerCounts.stale)} color="red" />
        <StatCard label="Aging (1 week – 1 month)" value={String(tickerCounts.aging)} color="yellow" />
        <StatCard label="Current (≤ 1 week)" value={String(tickerCounts.current)} color="green" />
      </SimpleGrid>

      {loading && <Text c="dimmed">Loading…</Text>}

      {!loading && (
        <>
          <Text fw={500} mb="sm">Accounts</Text>
          {filteredAccountRows.length === 0 && (
            <Text c="dimmed" size="sm" mb="xl">No accounts match the current filter.</Text>
          )}
          {filteredAccountRows.length > 0 && (
            <Table striped highlightOnHover verticalSpacing="xs" mb="xl">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Account</Table.Th>
                  <Table.Th>Last Transaction</Table.Th>
                  <Table.Th ta="right">Age (days)</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {accountStatuses.map((a) => (
                  <Table.Tr key={a.accountId}>
                    <Table.Td fw={600}>{a.label}</Table.Td>
                    <Table.Td c="dimmed">{a.lastTransactionDate ?? '—'}</Table.Td>
                    <Table.Td ta="right">{a.ageDays ?? '—'}</Table.Td>
                    <Table.Td><StatusBadge status={a.status} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          <Text fw={500} mb="sm">Tickers</Text>
          {tickerStatuses.length === 0 && (
            <Text c="dimmed" size="sm">No held securities match the current filter.</Text>
          )}
          {tickerStatuses.length > 0 && (
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ticker</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Last Price</Table.Th>
                  <Table.Th ta="right">Age (days)</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tickerStatuses.map((t) => (
                  <Table.Tr key={t.symbol}>
                    <Table.Td fw={600}>{t.symbol}</Table.Td>
                    <Table.Td c="dimmed">{t.name || '—'}</Table.Td>
                    <Table.Td c="dimmed">{t.lastPriceDate ?? '—'}</Table.Td>
                    <Table.Td ta="right">{t.ageDays ?? '—'}</Table.Td>
                    <Table.Td><StatusBadge status={t.status} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}
    </>
  )
}
