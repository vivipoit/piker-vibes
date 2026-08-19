import { useMemo, useState } from "react";
import {
  ActionIcon,
  AppShell,
  Burger,
  Button,
  Checkbox,
  Group,
  NavLink,
  NumberInput,
  Popover,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChartLine,
  IconChartPie,
  IconChevronDown,
  IconCoin,
  IconDatabase,
  IconHome,
  IconRefresh,
  IconScale,
  IconTimeline,
} from "@tabler/icons-react";
import { Route, Routes, useNavigate, useLocation } from "react-router-dom";

import Allocation from "./pages/Allocation";
import Dashboard from "./pages/Dashboard";
import DataStatus from "./pages/DataStatus";
import Dividends from "./pages/Dividends";
import GainsLosses from "./pages/GainsLosses";
import Portfolio from "./pages/Portfolio";
import PriceHistory from "./pages/PriceHistory";
import { useAccountFilter } from "./context/AccountFilterContext";
import { useCsvData } from "./context/CsvDataContext";
import { useDisplayCurrency } from "./context/DisplayCurrencyContext";
import { useFxRate } from "./context/FxRateContext";
import { accountRegion } from "./utils/accounts";
import { DEFAULT_FX_RATE, type Currency } from "./utils/currency";

const NAV_ITEMS = [
  { label: "Dashboard", icon: IconHome, path: "/" },
  { label: "Allocation", icon: IconChartPie, path: "/allocation" },
  { label: "Portfolio", icon: IconChartLine, path: "/portfolio" },
  { label: "G/L", icon: IconScale, path: "/gains-losses" },
  { label: "Dividends", icon: IconCoin, path: "/dividends" },
  { label: "Price History", icon: IconTimeline, path: "/price-history" },
];

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export default function App() {
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();
  const location = useLocation();
  const { files, loading, reload } = useCsvData();
  const { fxRate, setFxRate } = useFxRate();
  const [fxRateInput, setFxRateInput] = useState<number | string>(fxRate);
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();
  const { accountRows, activeAccountIds, toggleAccount, setAccountIds } =
    useAccountFilter();

  const { allIds, usIds, brIds } = useMemo(() => {
    const all = accountRows.map((a) => a.account_id);
    return {
      allIds: all,
      usIds: accountRows
        .filter((a) => accountRegion(a.currency) === "US")
        .map((a) => a.account_id),
      brIds: accountRows
        .filter((a) => accountRegion(a.currency) === "BR")
        .map((a) => a.account_id),
    };
  }, [accountRows]);

  // Purely derived: reflects a preset only while the checkbox selection
  // exactly matches it. Picking a preset is a one-shot bulk check/uncheck,
  // not a persistent mode - hand-tweaking a single account afterward just
  // leaves no preset highlighted, it doesn't get locked out.
  const regionPreset = sameIds(activeAccountIds, allIds)
    ? "ALL"
    : sameIds(activeAccountIds, usIds)
      ? "US"
      : sameIds(activeAccountIds, brIds)
        ? "BR"
        : "";

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group
          h="100%"
          px="md"
          justify="space-between"
          wrap="nowrap"
          style={{ overflowX: "auto" }}
        >
          <Group wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Title order={4}>📈 Piker Vibes</Title>
          </Group>
          <Group wrap="nowrap" gap="xs">
            <Popover position="bottom-end" shadow="md" withinPortal>
              <Popover.Target>
                <Button
                  variant="default"
                  size="xs"
                  rightSection={<IconChevronDown size={14} />}
                >
                  🌎 Accounts
                  {activeAccountIds.length < accountRows.length
                    ? ` (${activeAccountIds.length}/${accountRows.length})`
                    : ""}
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap="xs">
                  <SegmentedControl
                    size="xs"
                    value={regionPreset}
                    onChange={(value) =>
                      setAccountIds(
                        value === "ALL"
                          ? allIds
                          : value === "US"
                            ? usIds
                            : brIds,
                      )
                    }
                    data={[
                      { label: "All", value: "ALL" },
                      { label: "Brasil", value: "BR" },
                      { label: "US", value: "US" },
                    ]}
                  />
                  <Stack gap={4}>
                    {accountRows.map((account) => (
                      <Checkbox
                        key={account.account_id}
                        size="sm"
                        label={`${account.bank} — ${account.account_name}`}
                        checked={activeAccountIds.includes(account.account_id)}
                        onChange={() => toggleAccount(account.account_id)}
                      />
                    ))}
                  </Stack>
                </Stack>
              </Popover.Dropdown>
            </Popover>
            <Title ml="md" order={4}>
              💰
            </Title>
            <SegmentedControl
              mr="md"
              size="xs"
              value={displayCurrency}
              onChange={(value) => setDisplayCurrency(value as Currency)}
              data={[
                { label: "USD", value: "USD" },
                { label: "BRL", value: "BRL" },
              ]}
            />
            <NumberInput
              size="xs"
              label="Exchange rate (BRL per USD)"
              value={fxRateInput}
              onChange={setFxRateInput}
              min={0.01}
              step={0.01}
              decimalScale={4}
              w={190}
            />
            <ActionIcon
              variant="default"
              size="lg"
              mt={18}
              onClick={() => setFxRate(Number(fxRateInput) || DEFAULT_FX_RATE)}
              aria-label="Apply exchange rate"
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            label={item.label}
            leftSection={<item.icon size={18} />}
            active={location.pathname === item.path}
            onClick={() => {
              navigate(item.path);
              toggle();
            }}
          />
        ))}
        <NavLink
          mt="auto"
          label="Data Status"
          leftSection={<IconDatabase size={18} />}
          active={location.pathname === "/data-status"}
          onClick={() => {
            navigate("/data-status");
            toggle();
          }}
        />
        <Group justify="space-between" p="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {loading
              ? "Loading CSVs…"
              : `${files.length} CSV file${files.length === 1 ? "" : "s"} loaded`}
          </Text>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={reload}
            aria-label="Reload CSV data"
            loading={loading}
          >
            <IconRefresh size={16} />
          </ActionIcon>
        </Group>
      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/price-history" element={<PriceHistory />} />
          <Route path="/gains-losses" element={<GainsLosses />} />
          <Route path="/dividends" element={<Dividends />} />
          <Route path="/allocation" element={<Allocation />} />
          <Route path="/data-status" element={<DataStatus />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
