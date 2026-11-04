import { Field, Select, inputClass } from "@pdm/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

const meta = { title: "Controls/Form fields" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A text field with a hint: the hint is read out with the field. */
export const WithHint: Story = {
  render: () => (
    <div className="w-80">
      <Field label="Work order title" hint="What needs doing, in a few words" required>
        {(props) => <input {...props} className={inputClass} defaultValue="Replace drive-end bearing" />}
      </Field>
    </div>
  ),
};

/** An error: shown in words (not just red), announced, and the field is marked invalid. */
export const WithError: Story = {
  render: () => (
    <div className="w-80">
      <Field label="Hours to shelve" hint="Between 1 and 72" error="Enter a number between 1 and 72." required>
        {(props) => <input {...props} className={inputClass} defaultValue="96" inputMode="numeric" />}
      </Field>
    </div>
  ),
};

/** A long text area. */
export const TextArea: Story = {
  render: () => (
    <div className="w-96">
      <Field label="Findings">
        {(props) => (
          <textarea {...props} rows={4} className={inputClass} defaultValue="Seal leaking at the gland; replaced, testing now." />
        )}
      </Field>
    </div>
  ),
};

function SelectDemo({ hideLabel }: { hideLabel?: boolean }) {
  const [value, setValue] = useState<"24h" | "7d" | "30d">("24h");
  return (
    <Select
      label="Time range"
      hideLabel={hideLabel}
      value={value}
      onChange={setValue}
      options={[
        { value: "24h", label: "Last 24 hours" },
        { value: "7d", label: "Last 7 days" },
        { value: "30d", label: "Last 30 days" },
      ]}
    />
  );
}

export const Choice: Story = { render: () => <SelectDemo /> };
/** In a toolbar the label can be hidden from view; screen readers still hear it. */
export const ChoiceWithHiddenLabel: Story = { render: () => <SelectDemo hideLabel /> };
