import { useEffect, useMemo, useState } from "react";
import { Card, ColorSwatch, Group, Paper, Select, Text, Title } from "@mantine/core";
import { CompositeChart } from "@mantine/charts";
import { ReferenceDot, ReferenceLine, TooltipProps } from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import { useAccountFilter } from "../context/AccountFilterContext";
import { useCsvData } from "../context/CsvDataContext";
import { useDisplayCurrency } from "../context/DisplayCurrencyContext";
import { useFxRate } from "../context/FxRateContext";
import { getRows } from "../utils/csv";
import { convertCurrency } from "../utils/currency";
import { computeSymbolLots, LOT_EPSILON } from "../utils/lots";

interface OwnershipPeriod {
  start: string;
  end: string | null;
}

const OWNED_EPSILON = 1e-6;

function computeOwnershipPeriods(
  transactionRows: Record<string, string>[],
  symbol: string,
): OwnershipPeriod[] {
  const byDate = new Map<string, number>();

  for (const row of transactionRows) {
    if (row.symbol !== symbol || !row.quantity) continue;
    const quantity = Number(row.quantity);
    if (Number.isNaN(quantity)) continue;
    const delta =
      row.action === "SELL" || row.action === "CASH_IN_LIEU"
        ? -quantity
        : quantity;
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + delta);
  }

  const dates = [...byDate.keys()].sort();
  const periods: OwnershipPeriod[] = [];
  let cumulative = 0;
  let openPeriod: OwnershipPeriod | null = null;

  for (const date of dates) {
    const prevOwned = cumulative > OWNED_EPSILON;
    cumulative += byDate.get(date)!;
    const nowOwned = cumulative > OWNED_EPSILON;

    if (!prevOwned && nowOwned) {
      openPeriod = { start: date, end: null };
      periods.push(openPeriod);
    } else if (prevOwned && !nowOwned && openPeriod) {
      openPeriod.end = date;
      openPeriod = null;
    }
  }

  return periods;
}

function isOwnedOn(date: string, periods: OwnershipPeriod[]): boolean {
  return periods.some(
    (p) => date >= p.start && (p.end === null || date <= p.end),
  );
}

const SERIES_LABELS: Record<string, string> = {
  price: "Price",
  owned: "Owned",
  buyVolume: "Shares bought",
  sellVolume: "Shares sold",
};
const VOLUME_SERIES_KEYS = new Set(["buyVolume", "sellVolume"]);

// recharts filters out null-valued entries before this runs (Tooltip's
// filterNull default), so payload only ever has the series actually present
// on the hovered date - each needs its own unit, unlike the single shared
// valueFormatter the axes use.
function PriceHistoryTooltip({
  active,
  payload,
  label,
  displayCurrency,
}: TooltipProps<ValueType, NameType> & { displayCurrency: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <Paper withBorder shadow="md" radius="md" p="xs">
      <Text size="sm" fw={500} mb={4}>
        {label}
      </Text>
      {payload.map((item) => {
        const key = item.dataKey as string;
        const value = Number(item.value);
        return (
          <Group key={key} gap={6} wrap="nowrap">
            <ColorSwatch color={item.color ?? "gray"} size={10} />
            <Text size="sm">
              {SERIES_LABELS[key] ?? key}:{" "}
              {VOLUME_SERIES_KEYS.has(key)
                ? `${value.toLocaleString()} sh`
                : `${displayCurrency} ${value.toFixed(2)}`}
            </Text>
          </Group>
        );
      })}
    </Paper>
  );
}

export default function PriceHistory() {
  const { files, loading } = useCsvData();
  const { fxRate } = useFxRate();
  const { displayCurrency } = useDisplayCurrency();
  const { filterByAccount } = useAccountFilter();
  const [symbol, setSymbol] = useState<string | null>(null);

  const priceRows = useMemo(() => getRows(files, "prices.csv"), [files]);
  const allTransactionRows = useMemo(
    () => getRows(files, "transactions.csv"),
    [files],
  );
  const transactionRows = useMemo(
    () => filterByAccount(allTransactionRows),
    [allTransactionRows, filterByAccount],
  );

  // A symbol never transacted in ANY account (e.g. researched but never
  // bought) stays visible regardless of the account filter - only a symbol
  // that WAS transacted, but solely in accounts the filter excludes, drops
  // out of the dropdown.
  const everTransactedSymbols = useMemo(
    () =>
      new Set(
        allTransactionRows.filter((r) => r.symbol && r.quantity).map((r) => r.symbol),
      ),
    [allTransactionRows],
  );
  const heldSymbols = useMemo(
    () =>
      new Set(
        transactionRows.filter((r) => r.symbol && r.quantity).map((r) => r.symbol),
      ),
    [transactionRows],
  );

  const symbolOptions = useMemo(() => {
    const symbols = [...new Set(priceRows.map((r) => r.symbol))]
      .filter((s) => !everTransactedSymbols.has(s) || heldSymbols.has(s))
      .sort();
    return symbols.map((s) => ({ value: s, label: s }));
  }, [priceRows, everTransactedSymbols, heldSymbols]);

  // If the account filter narrows to accounts that never held the currently
  // selected symbol, drop back to "no selection" rather than showing a stale
  // chart for a symbol no longer in scope.
  useEffect(() => {
    if (symbol && !symbolOptions.some((o) => o.value === symbol)) setSymbol(null);
  }, [symbol, symbolOptions]);

  const { chartData, ownershipPeriods, avgPrice, stillHeld } =
    useMemo(() => {
      if (!symbol)
        return {
          chartData: [] as Record<string, unknown>[],
          ownershipPeriods: [] as OwnershipPeriod[],
          avgPrice: null as number | null,
          stillHeld: false,
        };

      const series = priceRows
        .filter((r) => r.symbol === symbol)
        .map((r) => ({
          date: r.date,
          close: Number(r.close),
          currency: r.currency,
        }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      const periods = computeOwnershipPeriods(transactionRows, symbol);

      // Share counts for my own buy/sell trades, keyed by date - plotted as
      // volume bars. A date can have both (e.g. a same-day buy and sell), so
      // buy/sell are tracked separately rather than netted.
      const volumeByDate = new Map<string, { buy: number; sell: number }>();
      for (const row of transactionRows) {
        if (row.symbol !== symbol) continue;
        if (row.action !== "BUY" && row.action !== "SELL") continue;
        const quantity = Number(row.quantity);
        if (Number.isNaN(quantity)) continue;
        const entry = volumeByDate.get(row.date) ?? { buy: 0, sell: 0 };
        if (row.action === "BUY") entry.buy += quantity;
        else entry.sell += quantity;
        volumeByDate.set(row.date, entry);
      }

      // Trades should always land on a date with price data, but merge in
      // any that don't rather than silently dropping the volume bar.
      const dates = [...new Set([...series.map((p) => p.date), ...volumeByDate.keys()])].sort();
      const priceByPointDate = new Map(series.map((p) => [p.date, p]));

      const data = dates.map((date) => {
        const point = priceByPointDate.get(date);
        const converted = point
          ? convertCurrency(point.close, point.currency, displayCurrency, fxRate)
          : null;
        const volume = volumeByDate.get(date);
        return {
          date,
          price: converted,
          owned: converted !== null && isOwnedOn(date, periods) ? converted : null,
          buyVolume: volume && volume.buy > 0 ? volume.buy : null,
          sellVolume: volume && volume.sell > 0 ? volume.sell : null,
        };
      });

      const position = computeSymbolLots(transactionRows).get(symbol);
      const held = position !== undefined && position.openQuantity > LOT_EPSILON;
      const avgInPositionCurrency = position
        ? held
          ? position.openCostBasis / position.openQuantity
          : position.soldQuantity > LOT_EPSILON
            ? position.realizedCostBasis / position.soldQuantity
            : null
        : null;
      // Cost basis is booked in the position's (account's) currency - convert
      // straight into the global display currency so it plots on the same
      // scale as the (also converted) price series above.
      const avg =
        avgInPositionCurrency !== null && position
          ? convertCurrency(avgInPositionCurrency, position.currency, displayCurrency, fxRate)
          : null;

      return {
        chartData: data,
        ownershipPeriods: periods,
        avgPrice: avg,
        stillHeld: held,
      };
    }, [symbol, priceRows, transactionRows, displayCurrency, fxRate]);

  const priceByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const point of chartData) {
      const price = point.price as number | null;
      if (price !== null) map.set(point.date as string, price);
    }
    return map;
  }, [chartData]);

  return (
    <>
      <Title order={2} mb="md">
        Price History
      </Title>
      <Select
        placeholder={loading ? "Loading…" : "Select a security"}
        data={symbolOptions}
        value={symbol}
        onChange={setSymbol}
        searchable
        clearable
        disabled={loading}
        mb="md"
        maw={420}
      />

      {!symbol && (
        <Text c="dimmed">
          Choose a security above to see its price history.
        </Text>
      )}

      {symbol && chartData.length === 0 && (
        <Text c="dimmed">No price data found for {symbol}.</Text>
      )}

      {symbol && chartData.length > 0 && (
        <Card withBorder padding="lg" radius="md">
          <CompositeChart
            h={420}
            data={chartData}
            dataKey="date"
            withDots={false}
            connectNulls={false}
            curveType="linear"
            valueFormatter={(value) => `${displayCurrency} ${value.toFixed(2)}`}
            withRightYAxis
            rightYAxisLabel="Shares traded"
            rightYAxisProps={{ tickFormatter: (value: number) => value.toLocaleString() }}
            tooltipProps={{
              content: ({ active, payload, label }) => (
                <PriceHistoryTooltip
                  active={active}
                  payload={payload}
                  label={label}
                  displayCurrency={displayCurrency}
                />
              ),
            }}
            series={[
              { name: "price", type: "line", color: "gray.5", label: "Price" },
              { name: "owned", type: "line", color: "teal.6", label: "Owned" },
              {
                name: "buyVolume",
                type: "bar",
                color: "green.6",
                label: "Shares bought",
                yAxisId: "right",
              },
              {
                name: "sellVolume",
                type: "bar",
                color: "red.6",
                label: "Shares sold",
                yAxisId: "right",
              },
            ]}
          >
            {ownershipPeriods.flatMap((period) => {
              const buyPrice = priceByDate.get(period.start);
              const sellPrice = period.end
                ? priceByDate.get(period.end)
                : undefined;
              const dots = [];
              if (buyPrice !== undefined) {
                dots.push(
                  <ReferenceDot
                    key={`${period.start}-buy`}
                    yAxisId="left"
                    x={period.start}
                    y={buyPrice}
                    r={5}
                    fill="var(--mantine-color-teal-6)"
                    stroke="white"
                    isFront
                  />,
                );
              }
              if (period.end && sellPrice !== undefined) {
                dots.push(
                  <ReferenceDot
                    key={`${period.end}-sell`}
                    yAxisId="left"
                    x={period.end}
                    y={sellPrice}
                    r={5}
                    fill="var(--mantine-color-red-6)"
                    stroke="white"
                    isFront
                  />,
                );
              }
              return dots;
            })}
            {avgPrice !== null && (
              // Solid = still holding (an active reference level); dashed =
              // fully sold (a historical reference, de-emphasized).
              <ReferenceLine
                yAxisId="left"
                y={avgPrice}
                stroke={
                  stillHeld
                    ? "var(--mantine-color-blue-6)"
                    : "var(--mantine-color-gray-5)"
                }
                strokeWidth={1.5}
                strokeDasharray={stillHeld ? undefined : "6 4"}
                label={{
                  value: `Avg ${displayCurrency} ${avgPrice.toFixed(2)}`,
                  position: "insideTopLeft",
                  fill: stillHeld
                    ? "var(--mantine-color-blue-6)"
                    : "var(--mantine-color-gray-6)",
                  fontSize: 11,
                }}
              />
            )}
          </CompositeChart>
          <Text size="xs" c="dimmed" mt="sm">
            Teal segments and dots mark periods you owned {symbol}. Red dots
            mark when you sold out. Green/red bars along the bottom (right
            axis) show shares bought/sold that day. The{" "}
            {stillHeld ? "solid blue" : "dashed gray"} line is your average price
            {stillHeld ? " for your current position." : " while you held it."}
          </Text>
        </Card>
      )}
    </>
  );
}
