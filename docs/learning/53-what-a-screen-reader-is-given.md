# Learning note 53: What a screen reader is given

_This note goes with Phase 7 chunk 1. Press Ctrl+K in the app and start typing straight away: that works now, and it didn't._

## 1. Two halves of the job

A screen reader can only say what the page gives it. So there are two questions:

- **Does the page give it the right things?** Names, roles, where focus is, what's announced. A browser test can check all of these.
- **Does it make sense when listened to?** Only a person can tell.

`e2e/screen-reader.spec.ts` does the first half, following the journeys of the [NVDA script](../testing/nvda-script.md). It isn't a replacement for listening.

## 2. What it found

- **Focus lost when a dialog closed.** Close any dialog with Escape and focus fell to the top of the page, so a keyboard user had to Tab all the way back. The dialog library returns focus only to its own trigger button, and ours open from code. Now each dialog remembers what had focus.
- **Ctrl+K didn't reach the search box.** Focus landed on the dialog's first control, the close button, so typing did nothing. This wasn't only a screen-reader bug: it affected anyone using the keyboard. Tests had missed it because a test's `fill()` puts focus in the box itself. That's a lesson in itself: **a test that does more than a person would can hide what a person would hit.**
- **Announcements that might never be heard.** A status box is watched by screen readers from when it appears, so text in a box that appears at the same moment can be missed. Seven charts did that. Now the box is always there and only its contents change.
- **Arrow keys that didn't reach charts.** In browse mode NVDA keeps the arrow keys for itself. `role="application"` tells it this element handles its own keys.

## 3. Exercises

1. Open a dialog from the keyboard, press Escape, and press Tab. Where do you go next?
2. In `dialog-focus.ts`, why check `isConnected` before giving focus back?
3. Find a `role="status"` in `LineChart.tsx`. Why is it outside the `active !== null` check?
