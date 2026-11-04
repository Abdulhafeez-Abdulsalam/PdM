# ADR-0019: A component catalogue with Storybook, checked in every theme

- **Status:** Accepted
- **Date:** 2026-11-04

## Context
The master prompt asks for "a component catalogue with every state" (§10): each shared component on its own, in loading, empty, error, stale and extreme-value states, in all three themes, with an accessibility checker. Scope decision 9 already chose **Playwright screenshot tests, run locally** over Chromatic (which needs an external account). The shared components live in `packages/ui` and `packages/charts`, which are kept free of anything but React and their own few libraries.

## Options considered
1. **Storybook in its own workspace** (`apps/catalogue`), with the stories there.
2. **Storybook with stories next to each component** in the packages: the usual layout, but it adds Storybook to packages that ship in the app.
3. **A hand-made gallery page** in the app: no new tool, but none of Storybook's controls, accessibility panel or wide familiarity.

For the screenshot tests: compare on every operating system with saved screenshots for each, or only on the one the screenshots were saved on.

## Decision
- **Storybook 10.6.5, pinned, in `apps/catalogue`**, stories in `apps/catalogue/src/stories`. The packages don't change. `npm run storybook` opens it on port 6006.
- **Themes** switched from the toolbar the way the app does it (`<html data-theme>`), set before a story draws so charts read the right colours. (The themes add-on set it afterwards, and charts drew in the previous theme's colours: found by the screenshots.)
- **The accessibility add-on**, with its findings counted as errors.
- **`npm run test:stories`** builds Storybook and opens every story in every theme in Chrome: axe (WCAG 2.1 A and AA, including contrast) must find nothing, and on Windows each must match its saved screenshot (129 of them, 2.4 MB, in `apps/catalogue/e2e/screenshots`). New stories are tested without listing them: the test reads Storybook's own index.
- **On GitHub, accessibility only**: a third CI job runs the same test, which skips the screenshot comparison there. Linux draws fonts slightly differently, so Windows screenshots would never match. The screenshots stay a check on this laptop, as scope decision 9 says.
- **No telemetry, no "what's new" popups** (both would contact Storybook's servers).

## Consequences
- Every shared component can be seen and tried on its own, in every state and theme, without running the app.
- A visual change to a shared component fails `npm run test:stories` until new screenshots are saved (`npm run test:stories -- -- --update-snapshots`) and looked at.
- Storybook adds 113 packages (development only, not in the app). `npm audit` now lists 17 moderate findings instead of 15: the same glob/minimatch issue as eslint's, through a Storybook build helper; the fix offered is a major downgrade.
- Not covered: the app's own composite widgets (`DashboardWidget` with its stale-data badge, pages), which need the app's data layer; the browser test suites cover those.
