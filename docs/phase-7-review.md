# Phase 7 review

Phase 7 took the alarm items an operator would miss most from the [Phase 6 review](phase-6-review.md)'s open list, after a first pass at the screen-reader script. It added a notification bell, on-call rosters with escalation, and first-out marking, and fixed five screen-reader problems. The simulation also changed: a simulated operator now works nuisance alarms, and cascades give first-out something to find.

*Reviewed 2026-11-04, at commit `05d025d` plus the fixes under "Found and fixed during this review".*

## Acceptance criteria

| # | Criterion (as amended in [scope-decisions.md](scope-decisions.md)) | Demo mode | Server mode | Evidence, re-run for this review |
|---|---|---|---|---|
| A | A new user finds the top 5 riskiest assets within 10 s of login | ✅ | ✅ | Every role's home-page test; server test |
| B | Any prediction traces to evidence, explanation, confidence and action within 2 clicks | ✅ | ✅ | Unit and browser tests; the walkthrough's scene 3 |
| C | An alarm becomes an assigned work order in under 30 s | ✅ | ✅ | Two clicks in both suites and the walkthrough |
| D | A technician who loses connection keeps what they typed | ✅ | ✅ | Both suites; the walkthrough's scene 6 |
| E | Dashboards stay responsive with 300 live tags at 1 update/s | ✅ | ✅ | Table below, with a caveat |
| F | Every screen passes automated accessibility checks in all three themes | ✅ | ✅ | axe on every screen, the bell and the on-call list, after one fix below |
| G | No hard-coded strings, units or colours outside tokens and the text catalog | ✅ | ✅ | New screens use the catalog; a missing key fails the tests (it did, once) |

**Criterion E, re-measured.** Slowest tap in three clean runs:

| Machine (Chrome CPU) | Slowest tap | Budget |
|---|---|---|
| This laptop (1×) | 56, 56, 64 ms | 100 ms |
| Older office PC (2× slower) | 112, 112, 80 ms | 200 ms |
| Low-end machine (4× slower) | 208, 232, 312 ms | 500 ms |

**The caveat.** During this review the test also failed twice, with one tap at 136 ms (1×) and one at 376 ms (2×), and the same session gave 72–104 ms at 1×. So it was checked properly: with the bell's data switched off, 72–80 ms; on the code from before Phase 7, 72, 80 and 104 ms, including a miss of its own. Phase 7 did not make the page slower. The slowest of 15 taps is a noisy number on a laptop doing other work, and the 1× budget has less margin than earlier reviews suggested. The budget stays as it is. If it keeps failing on the weekly run, the fair fix is to judge a high percentile over more taps, not to raise the limit.

**Size of the safety net:** 607 unit, component and server tests (web 275, mock data 224, contracts 44, UI 34, server 25, API client 5), 165 end-to-end tests in Chrome (153 demo-mode, 12 against the real server), and 43 stories in three themes. At the end of Phase 6: 591 and 152.

## What Phase 7 added

| Chunk | Highlights | Learning note |
|---|---|---|
| 1. Screen-reader fixes | The checkable half of the NVDA script as a test; five problems found and fixed | [53](learning/53-what-a-screen-reader-is-given.md) |
| 2. Notifications | A bell with what matters to each role, worked out from the plant; read and snooze kept per person; a simulated operator for nuisance alarms | [54](learning/54-telling-people-what-needs-them.md) |
| 3. Escalation | On-call chains by site and shift; automatic and manual escalation; shown on the alarm, the bell, the timeline, the audit log and alarm performance | [55](learning/55-nobody-answered.md) |
| 4. First-out | Bursts on one asset; the first marked, the rest linked; a filter; simulated cascades | [56](learning/56-what-came-first.md) |

## Found and fixed

| Found by | Problem | Fix |
|---|---|---|
| The screen-reader test | Focus lost when a dialog or side sheet closed | Each remembers what opened it |
| The screen-reader test | Ctrl+K left focus on the close button, so typing did nothing | Focus goes to the search box |
| The screen-reader test | Search results weren't announced; seven charts could miss announcements; vibration charts needed NVDA+Space | Counted aloud; status boxes always present; `role="application"` |
| Phone-width test | The bell made the top bar too wide | The logo gives way on phones |
| Text-catalog test | The new permission had no name in the access matrix | Named |
| A browser test | The filter value `1` came out quoted in the link | The word `on` |
| This review | The bell's number failed contrast in the dark and control-room themes | It uses the theme's own background colour |
| This review | Two tests assumed one table on the alarms page; the on-call list made two | They name the alarm table |

The contrast problem shows why this review ran everything: the targeted runs had only checked the bell for a role with no unread items visible at that moment, and the full suite saw it for the technician.

## Known, small, left as they are

| Item | Notes |
|---|---|
| **Notifications are in the app only** | Email, SMS, Teams and phone calls need outside services |
| **Escalation chains are fixed** | Set in code; an admin screen to edit rosters and timings is still open |
| **First-out means first, not cause** | Two unrelated alarms within 10 minutes count as a burst |
| **Follow-on alarms are grouped by asset** | A cause on one asset with consequences on another shows as two bursts |
| **Hover tooltips on the seven charts** | Announced to screen readers on hover as well as by keyboard, which may be chatty |

## Still needs a person

**The [NVDA script](testing/nvda-script.md).** Everything here checks what a screen reader is given, not how it sounds. The weekly demo-mode workflow also hasn't run on GitHub yet.

## What we learned

1. **Run everything before calling it done.** Targeted runs passed for three chunks while the full suite held five failures.
2. **Don't explain a bad number away, and don't believe it either.** Comparing with the old code took ten minutes and turned a guess into a finding.
3. **Derive what you can.** Notifications and rosters store almost nothing, so they can't drift, and restarts replay them exactly.
