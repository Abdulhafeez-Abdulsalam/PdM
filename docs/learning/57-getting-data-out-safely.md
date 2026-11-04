# Learning note 57: Getting data out safely

_This note goes with Phase 8 chunk 1. On the asset registry, press **Export CSV** and open the file in Excel or Notepad._

## 1. What CSV is

CSV, "comma-separated values", is the plainest table there is: one line per row, commas between cells. It sounds too simple to get wrong, and that's the trap.

- A cell containing a comma would split in two, so it goes in quotes. A cell containing a quote doubles it.
- Excel guesses a file's character encoding, and guesses wrong for "°C" unless the file starts with an invisible **byte-order mark**.

## 2. Formula injection

Excel runs any cell starting with `=` as a formula. Suppose someone types `=HYPERLINK(...)` into a comment, and an admin later exports and opens it. The spreadsheet does what the text says. This is called **CSV injection**, and it's why text starting with `=`, `+`, `-` or `@` gets a leading apostrophe. Real numbers aren't touched, so a value of −3.5 stays a number.

## 3. Every row, not just the page

A table showing 50 of 1,800 rows should export 1,800. So the button asks the backend page by page until it has them all, up to 10,000. If it stopped early it says so: silently handing someone a partial file is worse than an error, because they'll trust it.

## 4. Why exports are audited

Data leaving the app is exactly what an auditor asks about. The file itself is made in the browser, so the backend can't see it happen; the button tells it. A person could get around that, so it's a record, not a lock. The real protection is that exports only contain what the person could already see.

## 5. Exercises

1. Open an export in Notepad. Find the quotes around a cell, and explain why they're there.
2. Add a comment starting with `=1+1` to an asset and think through what would happen if comments were exported without protection.
3. Why does the alarm export have a Unit column, when the screen shows the unit beside each number?
4. Why does `toCsv` protect text, but not numbers?
