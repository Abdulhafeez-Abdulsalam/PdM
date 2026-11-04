import { KpiCard, Skeleton } from "@pdm/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Data/KPI card",
  component: KpiCard,
  args: {
    label: "Availability",
    value: "98.4",
    unit: "%",
    change: "+1.2 points vs the 30 days before",
    changeTone: "good",
    changeDirection: "up",
    trend: [97.1, 97.4, 97.2, 97.9, 98.1, 97.8, 98.4],
    target: "Target 97 %",
    lineage: "Uptime ÷ calendar time, all running assets, last 30 days",
  },
  decorators: [(Story) => <div className="w-64">{Story()}</div>],
} satisfies Meta<typeof KpiCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Typical: Story = {};
/** Up isn't always good: a longer repair time is bad news. */
export const WorseGoingUp: Story = {
  args: { label: "Mean time to repair", value: "7.6", unit: "h", change: "+1.9 h", changeTone: "bad", target: "Target 6 h" },
};
export const NoChange: Story = { args: { change: "No change", changeTone: "neutral", changeDirection: "flat" } };
/** Bare: just a label and a number. */
export const Minimal: Story = { args: { change: undefined, trend: undefined, target: undefined } };
/** No data yet: a dash, never a misleading zero. */
export const NoData: Story = { args: { value: "—", unit: undefined, change: undefined, trend: undefined } };
/** Extreme values: a huge number, a negative one, and a very long label, in a narrow card. */
export const Extreme: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <KpiCard {...args} label="Value at risk from predicted failures" value="$128,450,900" unit={undefined} />
      <KpiCard {...args} label="Net export" value="−1,204.7" unit="MWh" change="−312 %" changeTone="bad" changeDirection="down" />
      <KpiCard
        {...args}
        label="Planned maintenance compliance across every site, area and unit in the enterprise this quarter"
        value="100"
      />
    </div>
  ),
};
/** Loading: the card's shape, before the number arrives. */
export const Loading: Story = {
  render: () => (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  ),
};
