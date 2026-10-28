# Learning note 35: The copilot, citations, and the command palette

*This note goes with Phase 4 chunk 10. Press **.** (or the ✦ **Ask** button at the top) to open the copilot, and **Ctrl+K** (⌘K on a Mac) for the command palette. Press **?** for all the shortcuts.*

## 1. A scripted copilot, on purpose

ADR-0010 decided that the AI sits behind an interface, and that **today it's scripted**: no AI model, because a model needs an API key, and **a key must never be in the browser**, where anyone could copy it. Later a real model can answer through the same interface, from a server that keeps the key.

The scripted copilot answers seven kinds of question:

| Kind | Example |
|---|---|
| Likely failures | "Which compressors in Gulf Coast Midstream are likely to fail within 2 weeks?" |
| An asset's condition | "How is CBC-GT-101?" |
| Urgent alarms | "Which alarms are urgent right now?" |
| Maintenance backlog | "How big is the maintenance backlog?" |
| Value from predictions | "How much have predictions saved this year?" |
| Emissions | "What are our emissions?" |
| Spare parts | "Which spare parts are running short?" |

It reads the question for **an asset id**, **a kind of equipment** ("pumps", "turbines"), **a place** (any region or site name) and **a time span** ("30 days", "2 weeks", "this quarter"), then says how it read it ("Read as: Centrifugal Compressors · Gulf Coast Midstream · next 14 days") so you can tell if it misunderstood. Anything else gets an honest "I can only answer questions I was built for", with examples.

## 2. It answers through the same API as the screens

The copilot doesn't reach into the data directly. It calls the same read endpoints the pages use (`predictions.list`, `alarms.list`, `financials.overview`…). Two good things follow:

- **It can't see more than you can.** It has no secret back door. If a real model replaces it, give it the same endpoints as **tools**, and it's limited in the same way. That's how AI assistants are usually connected to systems today.
- **Its numbers agree with the screens.** The value it quotes is the same figure Financials shows, because it comes from the same place (note 30, "one number, one place").

Asking is a **read** (a GET), so questions never appear in the audit log (note 33): only changes do.

## 3. Every number cites its source

Each paragraph ends with small **citation** chips: the prediction, asset, alarm or work order it's about, or the page its figure comes from. Click one to check. This matters more for AI than for anything else on the platform: a confident sentence with no source is the thing to distrust. A test checks that every paragraph of every example answer has a citation, and that every cited item exists.

## 4. Suggestions, never actions

When the copilot finds a likely failure with no work order, it suggests **"Raise a work order for …"**. Clicking it opens a dialog saying exactly what will be created; **nothing happens until you confirm**, and only roles allowed to raise work from predictions can. An AI that acts on its own is how small mistakes become big ones.

## 5. The command palette and shortcuts

**Ctrl/⌘ + K** opens a search box for everything:

- **pages**, only the ones your role can open;
- **assets**, by id or name;
- **"Ask the copilot"** with what you typed.

Arrow keys move, **Enter** opens, **Escape** closes. Screen readers announce the highlighted result: the text box points at it (`aria-activedescendant`), the standard **combobox** pattern, so focus never has to leave the box.

Other shortcuts (**?** lists them): **g** then **h/a/l/m** to go home, to Assets, Alarms or Maintenance; **.** for the copilot; **[** to collapse the menu; **/** to jump to a page's search box; **t** for the time range. Single keys never fire while you're typing in a box, or "g" in a search would whisk you off to another page.

## 6. Found by the phone check

Adding two buttons to the top bar made **every page** 58 pixels too wide on a phone. The phone-width test (added in the Phase 3 review) caught it at once. The fix: the search button shows from small screens up (phones have no Ctrl key anyway), and on a phone the app name beside the logo is visible only to screen readers, so the link keeps its name.

## 7. Exercises

1. Ask "Which turbines are at risk this quarter?" What did it read the question as? Click a citation.
2. Ask the copilot something it wasn't built for. What does it say?
3. As Plant Manager, ask about likely failures and press "Raise a work order…". What does the dialog tell you? Cancel, then check the work-order board: was anything created?
4. Press Ctrl+K, type "wei" and Enter. Now try as the Executive: can you find Administration?
