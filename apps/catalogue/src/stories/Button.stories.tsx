import { Button } from "@pdm/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, Wrench } from "lucide-react";

const meta = {
  title: "Controls/Button",
  component: Button,
  args: { children: "Create work order" },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Secondary: Story = {};
export const Primary: Story = { args: { variant: "primary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Danger: Story = { args: { variant: "danger", children: "Trip the unit" } };
export const Disabled: Story = { args: { variant: "primary", disabled: true } };

/** Every variant and size side by side, with an icon. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-2">
          {(["primary", "secondary", "ghost", "danger"] as const).map((variant) => (
            <Button key={variant} variant={variant} size={size}>
              <Wrench aria-hidden className="size-4" />
              {variant} {size}
            </Button>
          ))}
        </div>
      ))}
    </div>
  ),
};

/** Extreme: a long label in a narrow space wraps rather than overflowing. */
export const LongLabel: Story = {
  args: { children: "Create a corrective work order for the gas compressor's second-stage dry gas seal", variant: "primary" },
  decorators: [(Story) => <div className="w-64">{Story()}</div>],
};

/** An icon-only button still needs a name for screen readers. */
export const IconOnly: Story = {
  args: { "aria-label": "Add", children: <Plus aria-hidden className="size-4" />, size: "sm" },
};
