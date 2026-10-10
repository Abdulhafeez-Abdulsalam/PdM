# Learning note 06 — Charts, units, and earning trust

*Goes with Phase 1, chunk 3 (Asset 360 and the prediction panel).*

## 1. Charts: decide the form before the colours

Rules this chunk follows, and why:

| Rule | Why |
|---|---|
| **One y-axis per chart.** Several sensors → several stacked charts sharing one crosshair | Two y-axes on one plot let the chart *invent* correlations — line up the scales differently and the lines appear to move together |
| **Line = average, faint band = min to max** | 30 days at 30-minute averages would hide a 3-second spike; the band keeps it visible (ADR-0006) |
| **Limit lines in status colours, data in series colours** | Colour that means "danger" is never reused for "sensor #2" |
| **Every chart has a Table view** | Screen-reader users, and anyone who wants exact numbers |
| **Refetch dims, doesn't flash** | Changing scope keeps the old chart at 60% opacity instead of a jumping skeleton |

The series colours weren't picked by eye. A validator checked them for colour-blind separation and contrast against **each theme's background**. The first Control-Room attempt failed (too grey to tell apart) and was replaced by one that passed.

## 2. A real unit bug, caught by looking

Switching to Oilfield units showed exhaust temperature *spread* as **74 °F** for a 22 °C spread. It should be **39.6 °F**.

- A **temperature** converts with `°F = °C × 1.8 + 32`.
- A **temperature difference** converts with `Δ°F = Δ°C × 1.8` — **no +32**. A 22-degree gap is a 39.6-degree gap whatever the starting point.

The fix had to start in the **contract**: the data had no way to say "this is a difference". A new quantity, `temperature_difference`, was added. TypeScript then refused to build until *every* place that lists quantities handled it — that's what `satisfies Record<Quantity, …>` buys you.

Lesson: unit bugs are silent. The number looked plausible. Only domain knowledge ("a 74 °F spread on a gas turbine? that's high") caught it.

## 3. State in the URL, again: `?prediction=PRED-0022`

The prediction panel opens on **any page** when the URL has `?prediction=…`. So:
- One click from a top-risk row opens it (acceptance criterion B — tested).
- The address bar can be copied and sent to a colleague, who sees the same panel.
- Browser Back closes it.

## 4. Retry wisely

When a request fails, retrying helps if the problem is temporary (network blip). It's pointless if the answer is definite ("asset not found") — it only delays the error page. [providers.tsx](../../apps/web/src/app/providers.tsx) now retries only temporary failures.

A test caught this — and while fixing it, a bug **in the test harness itself** turned up: it reported every error as "internal" instead of passing the real code through. Test helpers are code too, and can be wrong.

## 5. Exercises

1. Open an asset's **Telemetry** tab, tick three sensors, and hover a chart. Does the crosshair move on all three? Why is that useful when comparing signals?
2. Press **Table** above the charts. Compare a row with the tooltip at the same time.
3. Switch units between SI, Imperial and Oilfield on a gas turbine. Check one conversion by hand: compressor discharge pressure in bar × 14.5038 = psi?
4. In [units.ts](../../apps/web/src/shared/units.ts), the gas flow conversion for Oilfield divides by 1,000,000. Why? (Hint: what does "MM" in MMscfd stand for?)
5. Copy the address while a prediction panel is open, close the tab, and paste it into a new one. What do you see?
6. Start the demo storyline at 3600×, then open `CBC-GT-101` → **Health & prediction**. Watch the prediction appear around simulated day 2.
