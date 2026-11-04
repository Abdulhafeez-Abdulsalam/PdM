/** Things that open over the page. Each traps focus while open and closes with Escape. */
import { Button, Modal, Popover, PopoverClose, Sheet } from "@pdm/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

const meta = { title: "Overlays/Dialog, side sheet and popover", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function ModalDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div className="p-4">
      <Button onClick={() => setOpen(true)}>Open the dialog</Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Create work order"
        description="From alarm ALM-000163 on PBU-PMP-106"
        closeLabel="Close"
      >
        <p className="text-sm">Assign to the on-shift mechanical technician, priority 2.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Create work order
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div className="p-4">
      <Button onClick={() => setOpen(true)}>Open the side sheet</Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Prediction: bearing wear"
        description="PBU-PMP-106 · 74 % within 30 days"
        closeLabel="Close"
      >
        <p className="text-sm">The drive-end bearing's vibration has risen steadily for 12 days, with a matching rise in temperature.</p>
      </Sheet>
    </div>
  );
}

function PopoverDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div className="p-4">
      <Popover open={open} onOpenChange={setOpen} trigger={<Button>Display settings</Button>} className="w-64 p-3">
        <p className="text-sm font-medium">Units</p>
        <p className="mt-1 text-sm text-fg-muted">SI (bar, °C, m³/h)</p>
        <PopoverClose asChild>
          <Button size="sm" className="mt-3">
            Done
          </Button>
        </PopoverClose>
      </Popover>
    </div>
  );
}

export const Dialog: Story = { render: () => <ModalDemo /> };
export const SideSheet: Story = { render: () => <SheetDemo /> };
export const PopoverPanel: Story = { render: () => <PopoverDemo /> };
