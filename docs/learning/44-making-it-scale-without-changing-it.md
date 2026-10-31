# Learning note 44: Making it scale, without changing what it does

*This note goes with the fix that followed the [Phase 5 review](../phase-5-review.md): restarting the server got slower and slower the longer the simulated plant had run.*

## 1. Find out *where*, not just *how much*

The review measured restarts: 0.7 s after one simulated day, 99 s after thirty. Faster than linear growth means something gets more expensive as it goes. Rather than guess, the fix began by **timing each part** of the alarm engine's per-minute step on day 1, 4, 8, 12 and 16. Four parts grew together, and they had one thing in common: each looked through *every* alarm, every minute. The alarm list grows forever in an unattended plant, because alarms that clear but are never acknowledged must stay until someone acknowledges them (ISA-18.2). So every minute got longer.

## 2. Indexes: keep what you'll ask for

The engine only needs a few alarms each minute: those still waiting to clear, the shelved ones, and the cleared ones due to be forgotten. So it now keeps those in small, separate collections, an **index**, like the index at the back of a book. The trick that keeps them correct: every change to an alarm already went through one function (`markChanged`), so that function also updates the indexes. One place to get right, instead of a dozen.

After that, the timing showed a new leader: working out each fault's limit crossings afresh every minute, creating a million small objects a day. Cleaning up that garbage gets slower as the program's memory grows. Working each one out once, and again only when someone edits a limit, removed it. Now a simulated day costs about the same on day 60 as on day 7.

## 3. Prove it changes nothing

A **refactor** changes *how* code works, not *what* it does. "It still passes the tests" is weak evidence, because tests check what someone thought to check. So before touching anything:

1. Run the **old** code through a long, busy scenario (12 simulated days, with acknowledgements, shelving, chaos mode, the storyline) and save a **fingerprint** (a hash) of everything it produced at 48 checkpoints: every alarm, the summaries, the analytics.
2. Change the code. Run the same scenario. The fingerprints must match, all 48.

This is called a **golden master** (or characterisation) test.

## 4. Test the test

A check that can't fail proves nothing. So the fix deliberately **broke** the new code in small ways, and checked the fingerprint noticed:

- Forgetting to update the indexes: caught at the first checkpoint.
- Changing which of two alarms comes back first when both are shelved until the same moment: **not caught**. The scenario never shelves two alarms until the same moment.

The second is the useful finding: a gap in the evidence. A small, targeted unit test now covers exactly that case. It fails if the order is wrong and passes on both the old and the new code. Knowing what your tests *can't* see is as important as what they can.

## 5. Exercises

1. In `alarms.ts`, find `markChanged`. Why is it the right place to keep the indexes up to date? What would go wrong if one place changed an alarm without calling it?
2. The constructor rebuilds the indexes after setting up the starting alarms. Why are they built from scratch there, rather than kept up to date as before?
3. Why does the crossing cache compare the *limits object* rather than the limit values?
4. Think of a change you'd make to some code you know. What busy scenario would you fingerprint before making it?
