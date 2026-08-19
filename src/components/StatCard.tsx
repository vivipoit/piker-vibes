import { Badge, Card, Text } from '@mantine/core'

interface StatCardProps {
  label: string
  value: string
  color?: string
  delta?: string
  deltaColor?: string
}

export default function StatCard({ label, value, color, delta, deltaColor }: StatCardProps) {
  return (
    <Card withBorder padding="lg" radius="md" h="100%">
      <Text size="sm" c="dimmed" mb={4}>{label}</Text>
      <Text size="xl" fw={700} c={color} truncate>{value}</Text>
      {delta && (
        <Badge color={deltaColor} variant="light" size="sm" mt={6}>
          {delta}
        </Badge>
      )}
    </Card>
  )
}
