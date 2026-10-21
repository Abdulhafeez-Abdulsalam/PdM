import { defineConfig } from "vitest/config";

// Vitest replaces CSS with an empty string by default; the contrast test needs tokens.css as text.
export default defineConfig({ test: { css: { include: [/tokens\.css/] } } });
