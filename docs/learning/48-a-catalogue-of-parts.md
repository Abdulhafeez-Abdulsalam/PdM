# Learning note 48: A catalogue of parts (Storybook)

_This note goes with Phase 6 chunk 4. Run `npm run storybook` and open http://localhost:6006._

## 1. Why look at parts on their own

The app is built from shared parts: buttons, badges, KPI cards, dialogs, charts. Inside the app you only ever see each part in whatever state the data happens to put it in. You rarely see a KPI card with a nine-digit number, a chart with a gap in its readings, or the lanes during an alarm flood, unless you go looking.

A **component catalogue** shows each part on its own, in every state that matters, side by side. Designers check the look, developers try changes without clicking through the app, and the checks run on each state.

## 2. Stories

**Storybook** is the most widely used catalogue tool. Each example is a **story**: a few lines that show one part in one state. For example, from `KpiCard.stories.tsx`:

```tsx
/** No data yet: a dash, never a misleading zero. */
export const NoData: Story = { args: { value: "—", unit: undefined, change: undefined, trend: undefined } };
```

There are 43 stories, grouped in the sidebar. The states the master prompt asks for are all there:

- **Loading:** placeholders shaped like what's coming.
- **Empty:** saying why there's nothing, and what to do.
- **Failed:** one broken part shows a "try again" box instead of blanking the page.
- **Stale data:** gaps in readings, and readings of doubtful quality.
- **Extreme values:** $128,450,900, −1,204.7 MWh, a label too long for its card, a spike far above everything else, 300 alarms in 18 hours.

The stories live in their own workspace, `apps/catalogue`, so the shared packages that ship in the app don't depend on Storybook.

## 3. Three themes, and a bug the screenshots caught

The toolbar's paintbrush switches between light, dark and control room, the way the app does: by setting `data-theme` on the page. The first version used Storybook's themes add-on, and the first screenshots in the dark theme showed **bright white grid lines** on the charts. The add-on set the theme just *after* each story had drawn. Charts read their colours as they draw, so they drew in the previous theme's colours. Now the catalogue sets the theme *before* the story draws. Getting the order of events right is a common source of bugs.

## 4. Two automatic checks on every story

`npm run test:stories` builds the catalogue, opens every story in every theme in Chrome (43 × 3 = 129 views), and checks two things:

- **Accessibility:** axe finds no problems, including colour contrast in each theme. Everything passes.
- **Looks:** each view must match its saved **screenshot**. Change a button's padding and the test fails, showing the old picture, the new one, and the differences in red. If the change was intended, save new screenshots (`npm run test:stories -- -- --update-snapshots`) and look at them before committing.

On GitHub only the accessibility half runs. Linux draws fonts very slightly differently from Windows, so Windows screenshots would never match there.

## 5. Exercises

1. In Storybook, open **Data → KPI card → Extreme** and switch through the three themes. Which card's label is cut short with "…"? A screen reader still reads all of it (the text is there, only hidden by the layout); can someone looking at the screen? What would you change?
2. Open the **Accessibility** tab under any story. How many checks passed?
3. In `packages/ui/src/Button.tsx`, change `px-4` to `px-6` for medium (`md`) buttons, then run `npm run test:stories`. Which stories fail? Open the report it gives you, then undo the change.
4. Write a new story: a `HealthBadge` with a very long label, in a narrow box. Does the test pick it up without being told about it?
