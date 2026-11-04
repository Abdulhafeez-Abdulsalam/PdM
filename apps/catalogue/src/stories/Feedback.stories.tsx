/** The states every screen part can be in: loading, empty, failed, and notices. */
import { Banner, Button, EmptyState, ErrorBoundary, Skeleton } from "@pdm/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchX, WifiOff } from "lucide-react";

const meta = { title: "States/Loading, empty and errors" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: placeholders shaped like what's coming (they stop pulsing if motion is reduced). */
export const Loading: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-2">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-24" />
      <Skeleton className="h-8" />
      <Skeleton className="h-8" />
    </div>
  ),
};

/** Empty: say why there's nothing and what to do. */
export const Empty: Story = {
  render: () => (
    <EmptyState title="No alarms match these filters" icon={<SearchX aria-hidden className="size-6" />}>
      Try a longer time range, or clear the priority filter.
    </EmptyState>
  ),
};

/** Notices across the top of a page. Warnings and critical ones are announced to screen readers at once. */
export const Banners: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Banner>Demo data: values are simulated.</Banner>
      <Banner tone="warning">
        <WifiOff aria-hidden className="size-4" />
        No connection. Everything you&apos;ve entered is kept and will be sent when you&apos;re back.
      </Banner>
      <Banner tone="critical">Alarm flood: 34 new alarms in 10 minutes.</Banner>
    </div>
  ),
};

function Broken(): never {
  throw new Error("The chart's data was in an unexpected shape");
}

/** Failed: one broken part shows a fallback with a way to retry, instead of blanking the page. */
export const Failed: Story = {
  render: () => (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-health-critical p-4">
          <p className="font-medium">This part of the page couldn&apos;t be shown.</p>
          <p className="text-sm text-fg-muted">{error.message}</p>
          <Button size="sm" onClick={reset}>
            Try again
          </Button>
        </div>
      )}
    >
      <Broken />
    </ErrorBoundary>
  ),
};
