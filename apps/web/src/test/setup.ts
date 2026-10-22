import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import i18n from "../shared/text/i18n";

// Pages load their code on demand. In the app that's a quick download; in tests the runner
// compiles it on first use, which under load can take many seconds. Load those modules once,
// up front, so tests time the app rather than the compiler.
await Promise.all([
  import("../features/assets/AssetPage"),
  import("../features/assets/AssetRegistryPage"),
  import("../features/assets/ComparePage"),
  import("../features/operations/PowerPage"),
  import("../features/alarms/AlarmsPage"),
  import("../features/alarms/AlarmAnalyticsPage"),
  import("../features/predictions/PredictionDetail"),
  import("../features/predictions/PredictionConsolePage"),
  import("../features/predictions/PredictionPage"),
  import("../features/predictions/AnomaliesPage"),
  import("../features/maintenance/MaintenancePage"),
  import("../features/maintenance/WorkOrderPage"),
  import("../features/maintenance/ScheduleBoardPage"),
  import("../features/field/FieldPage"),
  import("../features/field/TaskPage"),
]);
configure({ asyncUtilTimeout: 10_000 });

// The test browser (jsdom) has no graphics or scrolling. Say "not available" quietly,
// exactly as a browser without WebGL would — the app then shows its list views.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
window.scrollTo = () => {};

// Criterion G: every visible word comes from the text catalog. If a screen asks for a key
// that isn't in en.json, i18next quietly shows the key itself ("schedule.title"); here, the
// test fails instead and names the key.
const missingText = new Set<string>();
i18n.options.saveMissing = true;
i18n.options.missingKeyHandler = (_languages, _namespace, key) => missingText.add(key);

afterEach(() => {
  cleanup();
  if (missingText.size === 0) return;
  const keys = [...missingText].sort();
  missingText.clear();
  throw new Error(`Text missing from en.json: ${keys.join(", ")}`);
});
