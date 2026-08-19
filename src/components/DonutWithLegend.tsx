import { Card, Group, Stack, Text } from '@mantine/core'
import { DonutChart, type DonutChartCell } from '@mantine/charts'
import { LOT_EPSILON } from '../utils/lots'
import { formatMoney } from '../utils/format'

function colorVar(color: string) {
  return `var(--mantine-color-${color.replace('.', '-')})`
}

export default function DonutWithLegend({ title, data, prefix }: { title: string; data: DonutChartCell[]; prefix: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  return (
    <Card withBorder padding="lg" radius="md">
      <Text fw={500} mb="sm">{title}</Text>
      {data.length === 0 ? (
        <Text c="dimmed" size="sm">No data yet.</Text>
      ) : (
        <Group align="center" wrap="wrap" gap="xl">
          <DonutChart
            data={data}
            size={200}
            thickness={26}
            withTooltip
            tooltipDataSource="segment"
            valueFormatter={(value) => formatMoney(value, prefix)}
          />
          <Stack gap={6} style={{ flex: 1, minWidth: 180 }}>
            {data.map((d) => (
              <Group key={d.name} justify="space-between" wrap="nowrap" gap="xs">
                <Group gap={6} wrap="nowrap">
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: colorVar(d.color),
                      flexShrink: 0,
                    }}
                  />
                  <Text size="sm" truncate>{d.name}</Text>
                </Group>
                <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                  {total > LOT_EPSILON ? `${((d.value / total) * 100).toFixed(1)}%` : ''}
                </Text>
              </Group>
            ))}
          </Stack>
        </Group>
      )}
    </Card>
  )
}
