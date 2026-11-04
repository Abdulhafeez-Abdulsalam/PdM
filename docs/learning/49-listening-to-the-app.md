# Learning note 49: Listening to the app (keyboard cursors and a screen-reader script)

_This note goes with Phase 6 chunk 5. Open http://localhost:5173/assets/GCM-CMP-105/vibration and press Tab until the waterfall chart has a blue outline._

## 1. A chart you can't point at

Some people don't use a mouse: they use the keyboard, a switch, or their voice. Some can't see the screen and use a **screen reader**, which reads the page aloud. For them, a chart drawn as a picture is one sentence (its summary) and nothing more, unless the chart can be explored another way.

The spectrum chart could already be explored: arrow keys move a cursor along it, and the value under the cursor is shown and read out. The **waterfall** and the **orbit** couldn't. Now they can:

- **Waterfall** (a stack of weekly spectra): ← → move along the frequencies, ↑ ↓ move to an older or newer week. Under the chart it says, for example, "14 Oct: 150 Hz, 0.917 mm/s". Press ↑ a few times on the same frequency and you hear a peak grow week by week, which is exactly what the waterfall is for.
- **Orbit** (the path of the shaft's centre): ← → follow the path, Page Up/Down jump a whole turn. It says, for example, "Turn 2 of 4, 15° after the once-per-turn mark: X −0.8 µm, Y 3.0 µm".

The mouse does the same: hover over either chart.

## 2. How the words reach a screen reader

The sentence under each chart sits in an element with `role="status"`. A screen reader watches status elements and reads out whatever changes in them, without moving the user away from the chart. The keys themselves are described in hidden text (`sr-only`) that the chart points to with `aria-describedby`, so a screen-reader user hears how to use the chart as they arrive on it.

## 3. What machines can't check

The automated checks (axe) look for things like missing names, wrong roles and low contrast. They find a good share of problems, but not whether the page **makes sense when listened to**: whether headings tell you where you are, whether a message is read at the right moment, whether a list of 266 alarms is bearable. That takes a person listening.

So this chunk includes a **[test script](../testing/nvda-script.md)** for NVDA, a free screen reader for Windows: setting it up, the dozen keys you need, and eight journeys (finding your way, acting on an alarm, a machine's history, vibration by ear, planning work, an offline field job, search and the copilot, the themes). Each step says what you should hear. Where what you hear is different or confusing, that's a finding to fix.

One finding is expected already. A screen reader has two modes: **browse mode**, where it uses the arrow and letter keys itself to read the page, and **focus mode**, where keys go to the page. The event timeline (chunk 3) tells the screen reader it handles its own keys (`role="application"`), so NVDA switches mode by itself. The three vibration charts don't yet; the script asks you to check whether you have to switch by hand.

## 4. Exercises

1. On the vibration page, Tab to the waterfall and press **End**, then **↑** five times. What changes in the sentence under the chart, and what stays the same?
2. Hover over the orbit with the mouse. Why does the cursor only appear when you're close to the path?
3. In `VibrationPlots.tsx`, find `role="status"`. What would a screen-reader user miss if it were a plain `<p>`?
4. Run journey 1 of the NVDA script. How many landmarks did you hear? Write down one thing that surprised you.
