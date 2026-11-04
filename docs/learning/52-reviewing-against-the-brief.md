# Learning note 52: Reviewing against the whole brief

_This note goes with Phase 6 chunk 8. Open the [Phase 6 review](../phase-6-review.md) and scroll to "The master prompt, one last time"._

## 1. Finishing is a decision

No project does everything in its brief. This one's master prompt describes years of product, and the honest result isn't "done", it's a clear account: what's built, what was changed on purpose and why, and what's still open. Someone picking the project up should be able to trust that list.

## 2. Check against the source, not your memory

It's easy to believe you built something because you remember talking about it. So the review re-read the original brief, line by line, and searched the code for each doubtful item. Searches can mislead: looking for "SSO" also matches "compre**sso**r", and "ILI" matches "reliab**ili**ty". So the doubtful ones were checked again against the app's text catalog, where words appear as a user reads them.

## 3. Three columns

Each area of the brief gets three columns:

- **Built:** working and tested.
- **Changed:** we chose differently, and the reason is recorded. This isn't a failure: replacing an offline-first app with a small safety net was one of the best decisions in the project.
- **Open:** not there. Saying so plainly is what makes the rest believable.

## 4. Re-run everything

A review re-runs every suite on the final code, not last week's results: 591 unit tests, 152 browser tests and 43 stories in three themes. One measure moved: the longest freeze on a very slow machine doubled in this run. It's within limits, and one run on a laptop proves little, so the review reports it instead of explaining it away.

## 5. Exercises

1. Pick one "Open" item you'd want most. Estimate it in chunks, like the phase plans do.
2. Find a "Changed" row and read its decision record. Would you decide the same today?
3. Run the [NVDA script](../testing/nvda-script.md): it's the biggest thing left that only a person can do.
