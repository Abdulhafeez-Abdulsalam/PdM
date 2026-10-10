# ADR-0007: Online-only — no offline sync

- **Status:** Accepted (removes the spec's offline-first PWA)
- **Date:** 2026-10-10

## Context
The spec asked for an offline-first app for field technicians, with background sync and conflict resolution. Offline sync is among the hardest problems in software: two people editing the same work order while disconnected, then merging without losing data. The product owner decided everything should require internet.

## Decision
- No service worker, no offline database, no sync queue, no conflict resolution.
- Field technician screens are normal responsive pages (phone and tablet sized) that need a connection.

**Small safety net (kept):**
1. When the connection drops, a banner says something like "No connection. Your typing is kept — press Submit again once you're back online." Nothing is sent automatically. (Final wording lives in the text catalog.)
2. Live values freeze and are marked stale.
3. Text typed into an open form stays in the form (and in the browser's session storage until the tab closes), so a dropped connection never wipes what the technician wrote. Submitting is blocked until the connection returns.

## Consequences
- ✅ Removes the riskiest and most complex part of the spec.
- ❌ Technicians at sites with no signal can't use the app there. They must complete the task when back in coverage.
- If offline is needed later, a new ADR will supersede this one. The clean API layer makes adding it possible without rewriting screens.
