# Screen-reader test script (NVDA)

Automated checks (axe, in the unit tests, the browser tests and the component catalogue) find only part of what makes a page hard to use with a screen reader. Whether the page *makes sense when listened to* takes a person. This script walks through the main journeys with **NVDA**, a free screen reader for Windows, in about 45 minutes. Write down what you hear where it differs from "you should hear", and the problems get fixed.

You don't need to know NVDA already; section 1 is all you need.

## 1. Setting up (10 minutes, once)

1. Download NVDA from the official site, **nvaccess.org** (free; a donation is invited but optional), and install it. Let it create the desktop shortcut.
2. Start the app in demo mode: in the project folder run `npm run dev`, then open http://localhost:5173 in **Chrome**.
3. Start NVDA with **Ctrl+Alt+N**. It starts talking. **Ctrl** on its own stops it mid-sentence.
4. The **NVDA key** is **Insert** (or Caps Lock, if you chose that when installing). Written below as **NVDA**.

The keys you'll use (NVDA reads a web page in **browse mode**, where letter keys jump around the page):

| Key | Does |
| --- | --- |
| ↓ / ↑ | Read the next / previous line |
| Tab / Shift+Tab | Next / previous thing you can use (link, button, field) |
| H / Shift+H | Next / previous heading; **1**–**6** for a heading of that level |
| D | Next landmark or named region (header, navigation, main, a board column…) |
| T | Next table; inside one, **Ctrl+Alt+arrows** move between cells |
| B / K / F | Next button / link / form field |
| NVDA+F7 | A list of every heading, link and landmark on the page |
| NVDA+Space | Switch between browse mode and **focus mode** (in focus mode, keys go to the page instead of NVDA: needed for the app's own shortcuts and for charts you steer with arrows) |
| Enter / Space | Press the button or link you're on |
| NVDA+Q | Quit NVDA |

NVDA plays a low "click" when it switches to focus mode and a higher one when it switches back.

## 2. Recording what you find

Copy this table into a note. For each step write **OK**, or what you heard and why it was confusing. "I didn't know where I was" and "it read the same thing twice" are both useful findings.

| Journey | Step | OK / what happened |
| --- | --- | --- |
| 1 | 1 | |

## 3. The journeys

Pick the role with the **Viewing as** box at the top of the page (Tab to it, then ↓ to choose).

### Journey 1: finding your way around (Control Room Operator, Command Center)

1. Reload the page. **You should hear** the page title, "Command Center · PdM".
2. Press **Tab** once. **You should hear** "Skip to main content, link". Press **Enter**: you're now at the start of the page's own content.
3. Press **D** a few times. **You should hear** the landmarks in turn: banner (the top bar), navigation (the side menu), main.
4. Press **NVDA+F7**, then choose **Headings**. **Check** the list makes sense as a table of contents: one level 1 heading naming the page, then the parts of the page. Escape closes it.
5. Press **1** to jump to the level 1 heading, then **H** repeatedly. **Check** each heading says what's under it.

### Journey 2: an alarm, from hearing it to acting on it (Control Room Operator, Alarms)

1. Go to **Alarms & Events** (Tab to it in the side menu, Enter).
2. Press **T** to reach the alarm table. **You should hear** the table's size, including its total row count (the list only draws the rows on screen, but says how many there are in all).
3. Move down a few rows with **Ctrl+Alt+↓**. **Check** each row says its priority (for example "P2 High"), what the alarm is, the asset and its state, and its place, like "row 5".
4. Press **NVDA+Space** for focus mode, then **Tab** until you're on a row, and press **↓** about 30 times quickly. **Check** NVDA keeps up, reads the row it lands on, and the row numbers go up one at a time with none skipped.
5. Still on a row, press **A** to acknowledge it. **You should hear** a message confirming it. Press **NVDA+Space** to go back to browse mode.
6. Press **B** until you reach a "Create work order from…" button, then **Enter**. **You should hear** a dialog called "Create work order" and its first field. **Tab** through it: each field has a name. Escape closes it; **check** you're back on the button you started from.

### Journey 3: a machine's history (Reliability Engineer, Asset 360)

1. Open http://localhost:5173/assets/PBU-PMP-106/telemetry?range=30d.
2. Press **H** until "History · Last 30 days". The charts follow. **Check** each chart is read as one picture with a sentence that says what it shows (first and last value, lowest and highest).
3. Press **B** to the "Show as table" button and press it. Press **T**. **Check** the table reads well cell by cell (Ctrl+Alt+arrows).
4. Press **H** to "Events on the same time axis". Press **Tab** to the event chart. **You should hear** "Event timeline, … events: Alarms …" and the hint about the keys. NVDA should switch to focus mode by itself here (the chart says it handles its own keys).
5. Press **→** a few times. **Check** each press reads out the event picked (kind, time, what happened).
6. Press **+** twice. **Check** the heading above now says the charts show a shorter window ("Events, and the charts above, from … to …"). Press **0** to show everything again.

### Journey 4: vibration, by ear (Condition Monitoring Analyst, Asset 360 → Vibration)

1. Open http://localhost:5173/assets/GCM-CMP-105/vibration.
2. Press **H** to "What the spectrum shows". **Check** the findings read as a list, each saying what's wrong and why.
3. **Tab** to the spectrum chart. **You should hear** its name and a one-sentence summary. Press **NVDA+Space** if NVDA didn't switch to focus mode, then **→** a few times. **Check** each press reads the frequency and the level.
4. **Tab** to the waterfall. **You should hear** its summary, then the keys. Press **→** and **↑**. **Check** each press reads the week, frequency and level (like "14 Oct: 150 Hz, 0.917 mm/s").
5. **Tab** to the orbit. Press **Page Down**, then **→**. **Check** it reads "Turn 2 of 4, … after the once-per-turn mark: X … µm, Y … µm".
6. **Note for each of these three charts** whether NVDA switched to focus mode by itself, or whether you had to press NVDA+Space. (We expect you may have to; if so, they'll be changed to switch by themselves, like the event chart.)

### Journey 5: planning work without a mouse (Maintenance Planner, Maintenance)

1. Go to **Maintenance**. Press **D** through the board's columns. **Check** each column says its name and how many work orders it has.
2. Press **B** to a "Move to… WO-…" button and press it. **You should hear** a menu of the columns it can move to. Choose one with ↓ and Enter. **You should hear** a confirmation that it moved.

### Journey 6: a job in the field, offline (Field Technician, Field)

1. Go to **Field** (the role's home page). Open the first job under "In progress".
2. Press **F** through the fields. **Check** each checkbox and reading field says what it is.
3. Turn off your Wi-Fi for a moment. **You should hear** that there's no connection and that what you've entered is kept. Turn Wi-Fi back on. **Check** you can tell the connection is back.

### Journey 7: asking and searching (Plant / Asset Manager)

1. Press **NVDA+Space** for focus mode, then **Ctrl+K**. **You should hear** the search box. Type "pump". **Check** NVDA says how many results there are, and **↓** reads each one. Escape closes it.
2. Press **.** (full stop) to open the copilot. Tab to the first suggested question and press Enter. **Check** the answer is read out when it arrives, including where it came from.
3. Press **?**. **You should hear** the keyboard shortcuts dialog. Read it with **↓** (press **NVDA+Space** first if you're still in focus mode).
4. Escape, then press **NVDA+Space** to go back to browse mode.

### Journey 8: the three themes

1. Open the display settings (the sliders button at the top right; NVDA reads it as "Display") and switch to **Dark**, then **Control room**.
2. Repeat steps 1 and 2 of Journey 1. **Check** nothing is read differently: themes change colours, never what's said.

## 4. When you've finished

Send the table of findings. Each problem is fixed, and the fix gets a test where one is possible, so it doesn't come back.
