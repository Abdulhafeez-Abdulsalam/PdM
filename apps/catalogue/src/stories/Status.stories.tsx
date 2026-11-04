import { HealthBadge, PriorityIcon, type Health, type Priority } from "@pdm/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const HEALTH: [Health, string][] = [
  ["healthy", "Healthy"],
  ["watch", "Watch"],
  ["degraded", "Degraded"],
  ["warning", "Warning"],
  ["critical", "Critical"],
  ["offline", "Offline"],
  ["maintenance", "In maintenance"],
];
const PRIORITY: [Priority, string][] = [
  ["p1", "P1 Urgent"],
  ["p2", "P2 High"],
  ["p3", "P3 Medium"],
  ["p4", "P4 Low"],
];

const meta = {
  title: "Status/Health and priority",
  component: HealthBadge,
  args: { state: "warning", label: "Warning" },
} satisfies Meta<typeof HealthBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Badge: Story = {};
export const Compact: Story = { args: { compact: true } };

/** Every health state: each has its own icon as well as its colour, so it reads without colour. */
export const AllHealthStates: Story = {
  render: () => (
    <ul className="flex flex-col gap-2">
      {HEALTH.map(([state, label]) => (
        <li key={state} className="flex items-center gap-4">
          <HealthBadge state={state} label={label} />
          <HealthBadge compact state={state} label={label} />
        </li>
      ))}
    </ul>
  ),
};

/** Alarm priorities (ISA-18.2): a different shape for each. */
export const AlarmPriorities: Story = {
  render: () => (
    <ul className="flex flex-col gap-2">
      {PRIORITY.map(([priority, label]) => (
        <li key={priority} className="flex items-center gap-2 text-sm">
          <PriorityIcon priority={priority} />
          {label}
        </li>
      ))}
    </ul>
  ),
};
