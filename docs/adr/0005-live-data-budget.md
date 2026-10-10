# ADR-0005: Live data budget — 300 tags at 1 update per second

- **Status:** Accepted (replaces the spec's 5,000 updates/second)
- **Date:** 2026-10-10

## Context
The spec asked for 5,000 live tag updates per second. That requires advanced batching and rendering work, and no person can read values changing that fast. The product owner asked for the lowest rate the screen can handle comfortably.

## Decision
| Budget | Value |
|---|---|
| Maximum update rate per tag | **1 per second** |
| Maximum tags subscribed at once (whole app) | **300** |
| Screen update ("flush") rate | **once per second**, all changes together |
| A value is "stale" after | **10 seconds** without an update |

How it works:
1. Components declare which tags they show. Only those tags are subscribed.
2. Subscriptions are **reference-counted**: two widgets showing the same tag = one subscription.
3. Incoming values are collected in a buffer and written to the live store once per second.
4. Components read only their own tags from the store, so a change to one tag doesn't redraw unrelated widgets.
5. If a page asks for more than 300 tags, the extra ones show a "too many live tags — showing last known values" note in development builds, and the page should be redesigned.

## Consequences
- ✅ Comfortable on an ordinary office laptop or a tablet.
- ✅ Much simpler code than the original target.
- ❌ Fast transients (under a second) are not visible live; they appear in history charts.
- Typical pages need far fewer than 300 tags (Asset 360 telemetry: ~20–40; control-room overview: ~100–200).
