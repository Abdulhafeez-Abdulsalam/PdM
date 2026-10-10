import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "../shared/text/i18n";

// The test browser (jsdom) has no graphics or scrolling. Say "not available" quietly,
// exactly as a browser without WebGL would — the app then shows its list views.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
window.scrollTo = () => {};

afterEach(() => cleanup());
