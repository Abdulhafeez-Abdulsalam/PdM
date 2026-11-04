# Learning note 58: A spreadsheet is not a table of text

_This note goes with Phase 8 chunk 2. Open **Reports**, pick a report, and press **Excel** at the top. Look at the tabs along the bottom._

## 1. What an .xlsx file really is

Rename an `.xlsx` to `.zip` and open it: it's a folder of small XML files, one per sheet. That's why our browser test can check a download: it unzips the file and looks inside.

## 2. Types matter

In CSV everything is text, and Excel guesses. In `.xlsx` each cell says what it is. A number stored as a number can be summed and sorted; stored as text, "100" sorts before "20". A date is stored as a number too, a count of days, with a format that shows it as a date.

So the export keeps real types: numbers stay numbers, and timestamps become real dates. Report tables are built for reading, so their cells are text; the export turns plain ones like `1,234` back into numbers, but leaves `$1.2M` as it is. Guessing that `$1.2M` means 1,200,000 would risk a wrong number in someone's sums.

## 3. Formula injection again

CSV needed protecting because Excel reads the text and decides what it is. In `.xlsx` the file states that a cell is text, so `=1+1` stays text and nothing runs. Choosing the right format removed the problem.

## 4. Load it only when it's needed

Almost nobody exports on a given visit, so the library shouldn't slow everyone down. `await import("./xlsx")` makes the bundler put it in a separate file, fetched the moment someone first presses Excel. The start-up download didn't grow for it.

## 5. Excel's rules

Sheet names have limits: 31 characters, none of `[ ] : * ? /` or a backslash, and no two the same (ignoring case). Break one and Excel refuses the file or offers to "repair" it. `sheetName` handles it, with a test, because a report's section titles are free text.

## 6. Exercises

1. Export alarms to Excel. Sum the Value column, then try the same on a text column.
2. Rename an export to `.zip` and find the sheet XML. Which cells have `t="s"`?
3. Export a report and find a value that stayed as text. Why not convert it?
4. Open your browser's network tab, press Excel, and find the file that loads.
