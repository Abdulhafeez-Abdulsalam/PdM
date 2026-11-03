# Learning note 46: Drawing only what shows (virtualised lists)

*This note goes with Phase 6 chunk 2. Open Alarms → list → "All", as a control room operator, with the browser's developer tools on the Elements tab, and scroll.*

## 1. Measure before you optimise

The plan said "virtualise the long tables". Measuring first changed that: three of the four lists (the asset registry, the tag browser and the audit log) were **already paged** into 50 rows, so there was nothing to gain. Only the alarm list drew everything: up to 500 rows.

And the cost wasn't where you'd guess. Scrolling was fine. The problem was **standing still**: every row says "raised 3 min ago", so the whole list redraws every second. With 266 alarms, the page froze for up to a tenth of a second, every second: exactly when an operator in an alarm flood needs it to respond.

## 2. What virtualising is

A screen shows maybe 15 rows. **Virtualising** means drawing only those (plus a few either side, so scrolling never shows a gap), with empty space above and below standing in for the rest, so the scroll bar still shows the whole list's length. As you scroll, rows leaving the view are removed and the ones arriving are drawn. The library (TanStack Virtual) works out which rows are in view from the scroll position and each row's height. Our rows differ in height (some carry badges), so each is measured as it's drawn.

Result: 16 rows drawn instead of 266, and no freezes.

## 3. The parts that are easy to break

Virtualising is simple to switch on and easy to get subtly wrong. Each of these was checked:

- **Screen readers.** A row that isn't drawn doesn't exist for a screen reader. So the table says how many rows there really are (`aria-rowcount`), and each row says where it sits (`aria-rowindex`): "row 140 of 267" stays true.
- **The keyboard.** ↓ on the last drawn row must go to a row that doesn't exist yet. So the list scrolls it into view first, then focuses it. A quick second press used to count from the old row and get lost; now it counts from the row on its way. A test presses ↓ 80 times and checks focus lands on exactly row 82.
- **Where the scrolling happens.** This app scrolls inside its `<main>` area, not the whole window, and the list starts some way down it. The library has to be told both.
- **Tests without a real browser.** The unit tests' fake browser (jsdom) can't lay out a page, so nothing would ever be "in view". There, the whole list is drawn as before. The real-browser test covers the virtualised version, and was checked to fail if virtualising is turned off.

## 4. Trade-offs

- The browser's find-in-page (Ctrl+F) only finds rows that are drawn. The alarm page's own filters search everything.
- Fast scrolling now draws rows as it goes. Measured, no frame was blocked, but the first frame after a big jump is a little slower than before, when everything was already there.

## 5. Exercises

1. In the developer tools' Elements tab, find the alarm table's `<tbody>` and scroll the page. What happens to the rows? What are the first and last `<tr>`s for?
2. Turn on a screen reader (NVDA on Windows, free), focus a row in the long list, and press ↓ a few times. What does it say about the row's position?
3. Why does the list redraw every second at all? What would you change if it shouldn't?
4. Why only above 60 rows? What would virtualising a 10-row list cost, and gain?
