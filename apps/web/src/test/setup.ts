import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import "../shared/text/i18n";

// Pages load their code on demand; the first time, the test runner compiles that code on the
// fly, which can take a few seconds. Wait up to 10 s for things to appear (default is 1 s).
configure({ asyncUtilTimeout: 10_000 });

// The test browser (jsdom) has no graphics or scrolling. Say "not available" quietly,
// exactly as a browser without WebGL would — the app then shows its list views.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
window.scrollTo = () => {};

afterEach(() => cleanup());
