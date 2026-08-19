import { useMemo } from "react";
import {
  Card,
  Code,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import DonutWithLegend from "../components/DonutWithLegend";
import StatCard from "../components/StatCard";
import { useAccountFilter } from "../context/AccountFilterContext";
import { useCsvData } from "../context/CsvDataContext";
import { useDisplayCurrency } from "../context/DisplayCurrencyContext";
import { useFxRate } from "../context/FxRateContext";
import {
  computeHoldingsByAccount,
  computeHoldingsBreakdown,
  mapToDonutData,
  OTHER_ASSET_TYPE,
  REGION_META,
  toCappedDonutData,
} from "../utils/allocation";
import { getRows } from "../utils/csv";
import { convertCurrency, currencyPrefix } from "../utils/currency";
import { formatMoney } from "../utils/format";
import { computeSymbolLots, LOT_EPSILON } from "../utils/lots";
import { type CashFlow, xirr } from "../utils/xirr";

interface UnrealizedResult {
  symbol: string;
  currency: string;
  unrealized: number;
  costBasis: number;
}

// Latest close per symbol (by date), used to value currently open lots.
function latestPricesBySymbol(priceRows: Record<string, string>[]) {
  const latest = new Map<string, { date: string; close: number; currency: string }>();
  for (const row of priceRows) {
    const close = Number(row.close);
    if (Number.isNaN(close)) continue;
    const existing = latest.get(row.symbol);
    if (!existing || row.date > existing.date) {
      latest.set(row.symbol, { date: row.date, close, currency: row.currency });
    }
  }
  return latest;
}

function computeUnrealizedGainsLosses(
  transactionRows: Record<string, string>[],
  priceRows: Record<string, string>[],
  fxRate: number,
): UnrealizedResult[] {
  const positions = computeSymbolLots(transactionRows);
  const latestPrices = latestPricesBySymbol(priceRows);
  const results: UnrealizedResult[] = [];
  for (const pos of positions.values()) {
    if (pos.openQuantity <= LOT_EPSILON) continue;
    const price = latestPrices.get(pos.symbol);
    if (!price) continue;
    // A security's price history isn't always quoted in the same currency
    // as the position holding it (e.g. NuBank Crypto: BRL account, USD
    // price history) - bridge with the global fx rate before combining.
    const close = convertCurrency(price.close, price.currency, pos.currency, fxRate);
    const unrealized = pos.openQuantity * close - pos.openCostBasis;
    results.push({
      symbol: pos.symbol,
      currency: pos.currency,
      unrealized,
      costBasis: pos.openCostBasis,
    });
  }
  return results;
}

function formatPercent(unrealized: number, costBasis: number) {
  if (costBasis <= LOT_EPSILON) return null;
  const pct = (unrealized / costBasis) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

interface PortfolioTotals {
  totalValue: number;
  growth: number;
  growthCostBasis: number;
  dividends: number;
}

// Total Value is the display-currency-converted market value of everything
// currently held. Growth is capital appreciation only — realized gain from
// past sales plus unrealized gain on open positions — deliberately
// excluding dividends, which are tracked separately below. Positions
// without price history are skipped from the open-position math (no market
// value to compute), but their realized gain from past sales still counts.
function computePortfolioTotals(
  transactionRows: Record<string, string>[],
  priceRows: Record<string, string>[],
  displayCurrency: string,
  fxRate: number,
): PortfolioTotals {
  const positions = computeSymbolLots(transactionRows);
  const latestPrices = latestPricesBySymbol(priceRows);
  const toDisplay = (value: number, currency: string) => convertCurrency(value, currency, displayCurrency, fxRate);

  let totalValue = 0;
  let growth = 0;
  let growthCostBasis = 0;

  for (const pos of positions.values()) {
    if (pos.openQuantity > LOT_EPSILON) {
      const price = latestPrices.get(pos.symbol);
      if (!price) continue;
      const close = convertCurrency(price.close, price.currency, pos.currency, fxRate);
      const marketValue = pos.openQuantity * close;
      totalValue += toDisplay(marketValue, pos.currency);
      growth += toDisplay(marketValue - pos.openCostBasis + pos.realized, pos.currency);
      growthCostBasis += toDisplay(pos.openCostBasis + pos.realizedCostBasis, pos.currency);
    } else {
      growth += toDisplay(pos.realized, pos.currency);
      growthCostBasis += toDisplay(pos.realizedCostBasis, pos.currency);
    }
  }

  let dividends = 0;
  for (const row of transactionRows) {
    if (row.action !== "DIVIDEND") continue;
    const amount = Number(row.amount);
    if (Number.isNaN(amount)) continue;
    dividends += toDisplay(amount, row.currency);
  }

  return {
    totalValue,
    growth,
    growthCostBasis,
    dividends,
  };
}

// Cash flows for the money-weighted annualized return: BUY/SELL/DIVIDEND/
// CASH_IN_LIEU rows already store `amount` from the investor's perspective
// (negative = money paid in, positive = money received back), which is
// exactly the sign convention XIRR needs. TRANSFER_EXTERNAL/INTEREST are
// deliberately excluded - they move cash that never shows up in Total Value
// either (it only prices held securities), so counting them would either
// double-count money that's about to appear again as a BUY or pull in
// un-invested cash this metric isn't meant to track. TRANSFER_INTERNAL,
// SPLIT, and RIGHTS have no real cash impact.
const CASH_FLOW_ACTIONS = new Set(["BUY", "SELL", "DIVIDEND", "CASH_IN_LIEU"]);

function buildCashFlows(
  transactionRows: Record<string, string>[],
  displayCurrency: string,
  fxRate: number,
): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const row of transactionRows) {
    if (!CASH_FLOW_ACTIONS.has(row.action)) continue;
    const amount = Number(row.amount);
    if (Number.isNaN(amount)) continue;
    flows.push({ date: row.date, amount: convertCurrency(amount, row.currency, displayCurrency, fxRate) });
  }
  return flows;
}

function formatRatePercent(rate: number) {
  return `${rate >= 0 ? "+" : ""}${(rate * 100).toFixed(1)}%`;
}

export default function Dashboard() {
  const { files, loading, error } = useCsvData();
  const { fxRate } = useFxRate();
  const { displayCurrency } = useDisplayCurrency();
  const { accountRows, filterByAccount } = useAccountFilter();

  const allTransactionRows = useMemo(
    () => getRows(files, "transactions.csv"),
    [files],
  );
  const transactionRows = useMemo(
    () => filterByAccount(allTransactionRows),
    [allTransactionRows, filterByAccount],
  );
  const priceRows = useMemo(() => getRows(files, "prices.csv"), [files]);
  const securityRows = useMemo(() => getRows(files, "securities.csv"), [files]);
  const names = useMemo(
    () => new Map(securityRows.map((r) => [r.symbol, r.name])),
    [securityRows],
  );

  const allResults = useMemo(
    () => computeUnrealizedGainsLosses(transactionRows, priceRows, fxRate),
    [transactionRows, priceRows, fxRate],
  );

  const { byRegion } = useMemo(
    () => computeHoldingsBreakdown(transactionRows, priceRows, securityRows, displayCurrency, fxRate),
    [transactionRows, priceRows, securityRows, displayCurrency, fxRate],
  );
  const byAccount = useMemo(
    () => computeHoldingsByAccount(transactionRows, priceRows, accountRows, displayCurrency, fxRate),
    [transactionRows, priceRows, accountRows, displayCurrency, fxRate],
  );
  const regionData = useMemo(() => mapToDonutData(byRegion, REGION_META, OTHER_ASSET_TYPE), [byRegion]);
  const accountData = useMemo(() => toCappedDonutData(byAccount), [byAccount]);

  const totals = useMemo(
    () => computePortfolioTotals(transactionRows, priceRows, displayCurrency, fxRate),
    [transactionRows, priceRows, displayCurrency, fxRate],
  );
  const growthPercent = formatPercent(
    totals.growth,
    totals.growthCostBasis,
  );

  const annualizedReturn = useMemo(() => {
    const flows = buildCashFlows(transactionRows, displayCurrency, fxRate);
    if (totals.totalValue > 0) {
      flows.push({ date: new Date().toISOString().slice(0, 10), amount: totals.totalValue });
    }
    return xirr(flows);
  }, [transactionRows, displayCurrency, fxRate, totals.totalValue]);

  const { topGains, topLosses } = useMemo(() => {
    const converted = allResults.map((r) => ({
      ...r,
      unrealized: convertCurrency(r.unrealized, r.currency, displayCurrency, fxRate),
      costBasis: convertCurrency(r.costBasis, r.currency, displayCurrency, fxRate),
    }));
    return {
      topGains: converted
        .filter((r) => r.unrealized > 0)
        .sort((a, b) => b.unrealized - a.unrealized)
        .slice(0, 10),
      topLosses: converted
        .filter((r) => r.unrealized < 0)
        .sort((a, b) => a.unrealized - b.unrealized)
        .slice(0, 10),
    };
  }, [allResults, displayCurrency, fxRate]);

  const prefix = currencyPrefix(displayCurrency);

  return (
    <>
      <Title order={2} mb="md">
        Dashboard
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        <StatCard
          label="Total Value"
          value={formatMoney(totals.totalValue, prefix)}
        />
        <StatCard
          label="Total Growth"
          value={formatMoney(totals.growth, prefix)}
          color={totals.growth >= 0 ? "teal" : "red"}
          delta={growthPercent ?? undefined}
          deltaColor={totals.growth >= 0 ? "teal" : "red"}
        />
        <StatCard
          label="Total Dividends Received"
          value={formatMoney(totals.dividends, prefix)}
          color="teal"
        />
        <Tooltip
          label="Money-weighted annualized return (XIRR) across all contributions and withdrawals, dividends included - compare this against the yearly growth rate you use for retirement projections."
          multiline
          w={280}
        >
          <div style={{ height: "100%" }}>
            <StatCard
              label="Annualized Return"
              value={annualizedReturn === null ? "—" : formatRatePercent(annualizedReturn)}
              color={annualizedReturn === null ? undefined : annualizedReturn >= 0 ? "teal" : "red"}
            />
          </div>
        </Tooltip>
      </SimpleGrid>

      {loading && <Text c="dimmed">Loading CSV files…</Text>}
      {error && <Text c="red">{error}</Text>}
      {!loading && !error && files.length === 0 && (
        <Text c="dimmed">
          No CSV files found. Drop files into <Code>data/</Code> and reload.
        </Text>
      )}

      {!loading && !error && files.length > 0 && (
        <SimpleGrid cols={{ base: 1, md: 2 }} mb="md">
          <DonutWithLegend title="Holdings by Region" data={regionData} prefix={prefix} />
          <DonutWithLegend title="Holdings by Account" data={accountData} prefix={prefix} />
        </SimpleGrid>
      )}

      {!loading && !error && files.length > 0 && (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Card withBorder padding="lg" radius="md">
            <Text fw={500} mb="sm">
              Top Unrealized Gains
            </Text>
            {topGains.length === 0 && (
              <Text c="dimmed" size="sm">
                No unrealized gains.
              </Text>
            )}
            <Stack gap={4}>
              {topGains.map((r) => (
                <Group key={r.symbol} justify="space-between" wrap="nowrap">
                  <Tooltip label={names.get(r.symbol)} disabled={!names.has(r.symbol)} openDelay={300}>
                    <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                      {r.symbol}
                    </Text>
                  </Tooltip>
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={600} c="teal">
                      {formatMoney(r.unrealized, prefix)}
                    </Text>
                    {formatPercent(r.unrealized, r.costBasis) && (
                      <Text size="xs" c="dimmed">
                        {formatPercent(r.unrealized, r.costBasis)}
                      </Text>
                    )}
                  </Group>
                </Group>
              ))}
            </Stack>
          </Card>

          <Card withBorder padding="lg" radius="md">
            <Text fw={500} mb="sm">
              Top Unrealized Losses
            </Text>
            {topLosses.length === 0 && (
              <Text c="dimmed" size="sm">
                No unrealized losses.
              </Text>
            )}
            <Stack gap={4}>
              {topLosses.map((r) => (
                <Group key={r.symbol} justify="space-between" wrap="nowrap">
                  <Tooltip label={names.get(r.symbol)} disabled={!names.has(r.symbol)} openDelay={300}>
                    <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                      {r.symbol}
                    </Text>
                  </Tooltip>
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={600} c="red">
                      {formatMoney(r.unrealized, prefix)}
                    </Text>
                    {formatPercent(r.unrealized, r.costBasis) && (
                      <Text size="xs" c="dimmed">
                        {formatPercent(r.unrealized, r.costBasis)}
                      </Text>
                    )}
                  </Group>
                </Group>
              ))}
            </Stack>
          </Card>
        </SimpleGrid>
      )}
    </>
  );
}
