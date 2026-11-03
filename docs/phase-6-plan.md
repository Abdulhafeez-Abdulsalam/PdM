# Phase 6 plan: finishing the master prompt's delivery plan

*Agreed 2026-11-03: the user chose this phase ("finish the master prompt's delivery plan") and made the two decisions below.*

Phases 1–5 built every module, the predictive core, the industry views and a real backend. What the master prompt asked for and never got is mostly **around** the app rather than in it: its delivery plan's last step ("testing & quality, documentation and a demo walkthrough script for stakeholders", §11, step 10 of the [architecture's delivery plan](01-architecture/README.md)), the quality expectations of §10 (a CI pipeline, a component catalogue with every state, a contribution guide), and three items every review since Phase 1 has carried forward: Storybook, virtualised tables and the synchronised event-timeline canvas. The repository is now public on GitHub, so this is also what visitors will meet first.

## Chunks, in order

Each chunk is small and reviewable, with its own commit (pushed to GitHub) and learning note. Safety nets first, so everything after is checked by them.

| # | Chunk | What you'd see | Notes |
|---|---|---|---|
| 1 | **CI on GitHub** | Every push to GitHub runs formatting, types, lint and all unit and server tests, plus the 12 server-mode browser tests; a green tick or red cross on each commit, and a badge in the README. The 21-minute demo-mode browser suite runs weekly and on demand | GitHub Actions, free for public repositories on standard runners. To check in the chunk: whether the runners have Chrome (the tests use the installed Chrome) |
| 2 | **Long lists stay fast: virtualised tables** | The alarm list during a flood, the asset registry, the tag browser and the audit log draw only the rows on screen, so thousands of rows scroll smoothly; keyboard and screen-reader behaviour stay as they are | TanStack Virtual (from the prompt's own stack, §2). Spec §2: "10k+ rows" |
| 3 | **The synchronised event timeline** | One timeline on Asset 360 and the alarms page with every kind of event in its own lane (alarms, operator actions, maintenance, process events, predictions), sharing its time axis with the sensor chart above it: zoom or brush one, the other follows; click an event to see it | Spec §6.5 "a single synchronized canvas". Built on the existing `events.list` endpoint |
| 4 | **A component catalogue: Storybook** | Every shared component (`packages/ui`, `packages/charts`) in every state the prompt lists: loading, empty, error, stale, extreme values; in all three themes; with the accessibility checker built in | Spec §10. Its stories double as screenshot tests (scope decision 9) |
| 5 | **Accessibility a machine can't check** | Keyboard cursors for the vibration waterfall and orbit (the last charts without one); a written screen-reader test script for NVDA (free, Windows) covering the main journeys, for you to run, with what was found fixed | Automated checks find only part of the problems; a person must listen. I can't hear a screen reader, so the pass is yours, guided step by step |
| 6 | **Documentation for visitors** | A rewritten README (what it is, both modes, screenshots, how to run, where to read); a contribution guide; a docs index; the MIT licence | Spec §10: "comprehensive README… contribution guide" |
| 7 | **Demo walkthrough script** | A 15–20 minute script for stakeholders: the storyline from first anomaly to verified repair, shown through the roles that live it, with what to click, what to say and timings; plus an automated run of it that takes the README's screenshots | Spec §11's final deliverable |
| 8 | **Phase 6 review** | Criteria re-tested, the master prompt's checklist gone through one last time: built, changed (and why), or still open | |

## Decisions (made 2026-11-03)

| Decision | Outcome |
|---|---|
| **Licence** (chunk 6) | **MIT**: others may use, change and share the code, keeping the copyright notice and licence text |
| **What CI runs** (chunk 1) | **Fast checks plus the server-mode browser tests on every push**; the long demo-mode suite weekly and on demand |

## Not in Phase 6

From the prompt, still open after this phase, for a later choice: turnarounds and critical-path shutdown planning; feature flags (there's no rollout audience yet); scheduled and emailed reports; the deployment items listed in the [Phase 5 review](phase-5-review.md); a real AI model; real OEE.

## Things to keep in mind

- **Nothing in the app changes behaviour** except the timeline (new) and the waterfall and orbit (keyboard cursors). Virtualised tables must look and behave the same.
- The budgets still hold, `npm run check` before every commit, and **every commit is pushed** to the public repository: no secrets, nothing personal.
