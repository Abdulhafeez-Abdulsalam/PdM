import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import "../shared/text/i18n";

// Pages load their code on demand. In the app that's a quick download; in tests the runner
// compiles it on first use, which under load can take many seconds. Load those modules once,
// up front, so tests time the app rather than the compiler.
await Promise.all([
  import("../features/assets/AssetPage"),
  import("../features/assets/AssetRegistryPage"),
  import("../features/alarms/AlarmsPage"),
  import("../features/predictions/PredictionDetail"),
  import("../features/predictions/PredictionConsolePage"),
  import("../features/predictions/PredictionPage"),
]);
configure({ asyncUtilTimeout: 10_000 });

// The test browser (jsdom) has no graphics or scrolling. Say "not available" quietly,
// exactly as a browser without WebGL would — the app then shows its list views.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
window.scrollTo = () => {};

afterEach(() => cleanup());
