# Phase 7 plan: what an operator would miss

Chosen on 2026-11-04 from the "Open" column of the [Phase 6 review](phase-6-review.md): first the screen-reader script, then the alarm features a control room operator would miss most.

## Chunks, in order

| # | Chunk | What you get | Notes |
| --- | --- | --- | --- |
| 1 ✅ | **Screen-reader fixes** | The checkable half of the [NVDA script](testing/nvda-script.md) as a test (`e2e/screen-reader.spec.ts`), and the problems it found fixed | Listening still takes a person: NVDA isn't installed here, and an AI can't hear it |
| 2 | **Notification centre** | A bell in the top bar with an unread count; a list of what matters to your role (urgent alarms, jobs assigned to you, new predictions), with filters, mark as read and snooze; each links to the thing itself; live, in both demo and server mode | Spec §7 and §5. In-app only: email, SMS and Teams need outside services |
| 3 | **Escalation and on-call** | A simple on-call roster per site; an urgent alarm nobody acknowledges escalates up a chain after set times, or by hand, and each step notifies the next person and is shown on the alarm and in the audit log; alarm KPIs gain "escalated" | Spec §6.5. Needs chunk 2 to notify anyone |
| 4 | **First-out** | When a burst of alarms hits one asset, the one that came first is marked "first out", so the operator sees the likely cause and not the pile of consequences; a filter and a badge in the list and on the timeline | Spec §6.5, an ISA-18.2 idea. Changes the alarm contract and engine |
| 5 | **Review** | Criteria and suites re-run, including the new journeys; the demo walkthrough updated | |

## A decision to make along the way

**Should simulated operators work some alarms?** Today about 3,300 pile up in four simulated days, which would swamp a notification centre and escalation. A small simulated operator acknowledging and clearing most low-priority alarms would keep the demo believable. Recommended, inside chunk 2.

## Things to keep in mind

- **Both backends.** Every feature goes through the contracts first, works in demo and server mode, and survives a restart through the command log.
- **Every commit is pushed** after `npm run check`.
- Ask before starting each chunk.

**What chunk 1 added:** `e2e/screen-reader.spec.ts` follows journeys 1–7 of the script and checks what a screen reader is given. It found: focus lost when any dialog or side sheet closed (now returned to what opened it); Ctrl+K leaving focus on the dialog's close button, so typing did nothing (now in the search box); search results not announced (now counted aloud); seven charts whose status box appeared only when it had something to say, which screen readers can miss (now always there); and the three vibration charts needing NVDA+Space to reach their arrow keys (now `role="application"`, like the event chart, with the keys described on the spectrum too). See [learning note 53](learning/53-what-a-screen-reader-is-given.md).
