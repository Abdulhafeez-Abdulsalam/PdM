# Learning note 51: Rehearsing the demo with a robot

_This note goes with Phase 6 chunk 7. Open [the demo walkthrough](../demo-walkthrough.md) next to `apps/web/e2e/walkthrough.spec.ts`: each scene is in both._

## 1. A demo is a test nobody wrote

A demo script is a list of steps with an expected result, which is what a test is. The difference is that a script on paper rots: someone changes a button, nobody notices, and it breaks in front of the audience.

So this one exists twice: once in words for the presenter, and once as an automated browser test that does the same clicks. If the app changes so that a step no longer works, the test fails long before anyone stands up to present.

## 2. Acting it out found real bugs

Unit tests check parts. Only going through the whole story, as a person would, showed these:

- **The stale menu.** Five finished modules were still greyed out and labelled "Phase 4", because a setting (`CURRENT_PHASE`) had stayed at 3. Every page had shown it since Phase 4. Nobody had asked "what would a visitor think?" until the screenshots did.
- **The stale person.** Changing **Viewing as** told the simulation about the new role, but the app kept what it had already fetched, including "who am I". The Field page showed "0 open jobs assigned to" the previous role's person. Tests never hit this because they pick the role before the page loads; a presenter changes it mid-demo. The fix is small: refresh the cache after the change. It got its own unit test, which was checked to fail without the fix.

The general lesson: **a cache is only as good as what tells it to refresh.** When something that all the data depends on changes (who you are, which site), everything fetched before it is suspect.

## 3. Debugging honestly

Two wrong turns on the way are worth knowing:

- The test once failed in a different place each run. The cause was a text edit that hadn't applied: a command replaced one line, but the formatter had split that code over several lines, so nothing matched, and no error said so. When a fix "doesn't work", first check that it's really there.
- A search box offered "Ask the copilot about CBC-GT-101" before the asset itself had loaded, and the test chose the first match. A person would have looked at the words. Tests should say what they want precisely (the line starting with the asset's id), and the presenter's script now warns about it too.

## 4. State that lives in the page

In demo mode the whole simulated plant runs in the browser page, in a Web Worker. A reload throws it away and starts again. So neither the presenter nor the test may reload. Most browser tests jump straight to a URL; this one has to move through the app's own menus, which is why it found things they don't.

## 5. Screenshots from the same run

The README's pictures are taken by the same test, with its own config (`npm run demo:screenshots`). They're real (not mock-ups), and when the look changes, one command retakes them all. A normal test run doesn't write them, so it doesn't change files in the repository.

## 6. Exercises

1. Run the whole walkthrough yourself from the script, timing each scene. Which one runs long?
2. Run `npm run e2e -- -- -g "demo walkthrough" --headed`, and watch the robot present.
3. In `providers.tsx`, what does `useSimulationControl` do that `transport.control` alone doesn't?
4. Find another place where the app holds on to something that could change underneath it. What refreshes it?
