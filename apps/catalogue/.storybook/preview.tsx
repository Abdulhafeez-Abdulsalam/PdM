import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "../src/catalogue.css";
import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  // The three themes, switched the way the app switches them (<html data-theme="…">), from the
  // toolbar or the URL (&globals=theme:dark).
  globalTypes: {
    theme: {
      description: "Theme",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        dynamicTitle: true,
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "control-room", title: "Control room" },
        ],
      },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    (Story, context) => {
      const theme = String(context.globals.theme ?? "light");
      // Set before the story draws: charts read the theme's colours as they draw. (An effect would
      // run after the charts', so they'd draw in the previous theme.)
      document.documentElement.dataset.theme = theme;
      // A new key per theme draws the story afresh, in the new colours.
      return <div key={theme}>{Story()}</div>;
    },
  ],
  parameters: {
    layout: "padded",
    // The accessibility panel's findings count as failures, not just hints.
    a11y: { test: "error" },
    controls: { expanded: true },
  },
};
export default preview;
