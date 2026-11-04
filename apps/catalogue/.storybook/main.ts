/**
 * Storybook: the component catalogue (Phase 6 chunk 4, spec §10). The stories live here, not next
 * to the components, so the shared packages stay free of Storybook.
 *
 *   npm run storybook      (from the repository root; opens on http://localhost:6006)
 */
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y"],
  // No usage reports to Storybook, and no "what's new" popups fetched from the internet.
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  // Tailwind turns the components' class names into CSS, as in the app.
  viteFinal: (vite) => ({ ...vite, plugins: [...(vite.plugins ?? []), tailwindcss()] }),
};
export default config;
