# Learning note 23: FMEA and root-cause analysis

*This note goes with Phase 3 chunk 6. As **Reliability Engineer**, open Reliability and use the new tabs: **FMEA** and **Root-cause analysis**. Every asset's Failures tab also has a "Start a root-cause analysis" link.*

## 1. From analysis to action

Chunks 4 and 5 measured how things fail. This chunk decides **what to do about it**, with the two classic tools:

| Tool | Looks at | Answers |
|---|---|---|
| **FMEA**, failure mode and effects analysis | every way a *type* of equipment can fail | where should maintenance effort go, and what kind of maintenance? |
| **RCA**, root-cause analysis | one *failure* (or a repeating one) | why did it really happen, and what stops it happening again? |

## 2. FMEA: three scores and a product

For each failure mode, three scores from 1 to 10:

- **Severity (S)**: how bad a failure is. A process leak or structural failure scores high; a spurious stop scores low. More critical types of equipment get one point more.
- **Occurrence (O)**: how often it happens, here from the real failure history (failures per asset per year, banded).
- **Detection (D)**: how hard it is to see coming. *1 is obvious, 10 invisible.* Where a predictive model already watches for the mode (bearing wear, fouling…), detection drops by three.

**RPN = S × O × D** (1–1,000) ranks the modes. Two rules decide where to act: any RPN of 200 or more, **and any severity of 9 or more whatever its RPN**. A rare catastrophic failure can have a low RPN, and the RPN alone would hide it. That's a well-known weakness of RPN, and why the severity rule exists.

## 3. Which kind of maintenance?

The strategy column combines the Weibull pattern from chunk 5 with the detection score ([rca.ts](../../packages/mock-data/src/rca.ts), `strategyFor`):

| Situation | Strategy | Why |
|---|---|---|
| Harmless and unmonitored | **Run to failure** | fixing it when it breaks is cheapest |
| A model watches for it | **Condition-based** | act when the condition changes, not on a calendar |
| Wears out (β > 1) | **Time-based** | replace or overhaul on a schedule, around B10 |
| Fails early (β < 1) | **Fix the design or installation** | a schedule would make it worse: each new part starts in its riskiest period |
| Random (β ≈ 1) | **Condition-based** | age doesn't predict it, so a calendar can't either |

This is the core idea of **reliability-centred maintenance (RCM)**: match the task to *how* the thing fails.

## 4. Root-cause analysis: three ways of asking "why?"

An investigation page has, top to bottom:

1. **What happened**: a timeline of the asset's failures, work orders and predictions around the problem, built from records the app already holds.
2. **5 Whys**: ask "why?" until the answer is something you can fix. "The pump tripped" → "the bearing failed" → "it was misaligned" → "the alignment tool wasn't available" → "nobody owns the tooling list". The last answer is fixable; the first isn't.
3. **Fishbone (Ishikawa) diagram**: six "bones" where causes usually hide: people, machine, method, material, measurement, environment. It stops a team fixating on the first idea; list everything plausible, then test.
4. **The root cause in one sentence**, which is required before the investigation can be closed.
5. **Corrective actions**: each can **raise a work order** straight away. The work order remembers where it came from (a new work-order source, `rca`), so its page links back to the investigation, and it appears on the investigation's timeline.

An investigation goes **open → in review → closed**. Closed is read-only until reopened. The server enforces this as well as the page, because a rule only in the user interface isn't a rule (note 7).

## 5. Design choices worth noticing

- **One Save button, not autosave.** The 5 Whys and fishbone are edited locally, and Save sends them in one request. Investigations are thoughtful work, and a half-typed "why" shouldn't go to everyone mid-sentence. The page knows when something changed (`dirty`) and only enables Save then.
- **A fresh editor per investigation.** The editor is rendered with `key={rca.id}`, so opening another investigation starts a new form from that investigation's saved state, without copying data between components with effects.
- **The fishbone picture is decoration for the form.** Screen readers and keyboards use the lists underneath. The picture has a summary label ("6 causes: People 1, Machine 1…").
- **Links inside sentences are underlined.** The browser accessibility check caught a link marked out only by colour; colour alone fails people who can't see the difference.
- **Work orders have an ID and a number.** `wo-12` is the internal ID used in URLs; `WO-12` is what people say. Actions store both and show the number.

## 6. Exercises

1. Open FMEA for **Gas turbine**. Which mode tops the list, and why does vibration score so low despite being serious?
2. Find a mode with severity 9 or more but RPN under 200. Why does it still say "act on this"?
3. Open the investigation that's **in review**. Read its 5 Whys: at which "why" does the answer become something you could fix?
4. Start an investigation from a bad actor's **Failures** tab, add an action with "Raise a work order" ticked, then open the work order. What does it show as its source?
