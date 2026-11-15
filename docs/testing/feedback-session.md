# Feedback session guide

For showing PdM to someone who has worked in maintenance or a control room, and writing down what confuses them. About 45 minutes.

This is not the [demo walkthrough](../demo-walkthrough.md). That one is a pitch: you drive and talk. Here **they drive and you watch**. You learn most from where they hesitate, what they call things, and what they expected to find and didn't.

## Before the session

1. In the project folder run `npm run dev`, and open http://localhost:5173 in Chrome, full screen.
2. Reload the page just before they sit down, so the plant is fresh. Leave **Speed** at 1×.
3. Have this page open on a second screen or printed, with the note sheet at the end.
4. Decide which set of tasks fits them: **control room** or **maintenance**. Do one set properly, not both in a hurry.

## The five rules

1. **They hold the mouse.** If you take it, you learn nothing.
2. **Don't explain the app first.** One sentence is enough: "It's a tool for watching equipment and organising maintenance. The plant and data are simulated."
3. **Ask them to think aloud.** "Tell me what you're looking at and what you expect to happen."
4. **When they get stuck, wait.** Count to ten. Then ask "what are you looking for?", not "it's over there". If they're still stuck after a minute, show them and write it down as a finding.
5. **Don't defend it.** If they say something is wrong or silly, say "tell me more" and write down their words.

## What to say at the start

> Thanks for doing this. I've built a maintenance tool as a learning project, and I need someone who knows the real work to tell me where it's wrong or confusing. I'm testing the tool, not you: if something's hard to find, that's the tool's fault and exactly what I need to know. Please say what you're thinking as you go. The plant, the people and all the numbers are made up.

Then ask, and note the answers:

- What was your job, and for how long?
- What tools did you use for alarms or work orders? What did you like or hate about them?

## Tasks: control room

Set **Viewing as** (top of the page) to **Control Room Operator** yourself, then hand over. Read each task aloud as written. Don't name pages or buttons.

| # | Say this | What you're watching for |
| --- | --- | --- |
| 1 | "You've just come on shift. What needs your attention first?" | Where do they look: the alarm bar, the bell, the Command Center? Do the numbers mean anything to them? |
| 2 | "Find the most urgent alarm and deal with it the way you would at work." | Can they find the alarm list? Do they acknowledge? Do the priorities (P1–P4) and states make sense? |
| 3 | "This alarm is a nuisance you want out of the way for a few hours. What would you do?" | Do they find **shelve**? Is asking for a reason and a time normal to them? |
| 4 | "Several alarms came in together on one machine. Which one started it?" | Do they notice **first out**? Do they trust it? Would they use **Hide follow-on alarms**? |
| 5 | "You're busy and can't deal with an urgent alarm. What happens to it? Who gets it?" | Do they find **On call now**? Do the escalation times feel right, too slow or too fast? |
| 6 | "This alarm needs a repair. Get a job raised for it." | Can they create a work order from the alarm? Is the form what they'd expect? |
| 7 | "Your shift is ending. What would you hand to the next operator?" | Do they find **Reports → Shift handover**? Is anything missing from it? |

## Tasks: maintenance

Set **Viewing as** to **Maintenance Planner** (for tasks 4 and 5, switch it to **Field Technician** yourself).

| # | Say this | What you're watching for |
| --- | --- | --- |
| 1 | "Which machine would you worry about most this week, and why?" | Where do they look? Do "health score", "probability" and "remaining life" mean something, or sound made up? |
| 2 | "Open one of those predictions. Do you believe it? What would you check before acting?" | Is the evidence what they'd want? What's missing? Would they trust a percentage? |
| 3 | "There's new work waiting. Plan it: who does it, and when?" | Can they use the board? Do the steps (requested, planned, scheduled, approved…) match real life? |
| 4 | As technician: "You've arrived at the job. Do it and close it out." | Are the steps, readings and safety checks realistic? What would stop them in the field? |
| 5 | As technician: "You've lost signal halfway through." (Tick **Drop the connection** in the Simulation panel for them.) | Do they notice the message? Do they trust that nothing is lost? |
| 6 | "Show me what's happened to pump PBU-PMP-106 over the last month." | Can they find an asset and its history? Do the charts and the event timeline help or overwhelm? |
| 7 | "Your manager wants the list of open jobs in a spreadsheet." | Do they find the export? Are the columns the ones they'd need? |

## Questions for the end

- What was the most confusing thing?
- What would you never use? What would you use every day?
- What's missing that you'd need on a real shift?
- Which words did we get wrong? What do you call them?
- Does anything here behave differently from real equipment or real procedures?
- Would you trust the predictions? What would make you trust them more?

## Note sheet

Write during the session, not after. Their exact words are worth more than your summary. Copy this table for each person.

**Background:** (job and years, no name)

| Task | What they did | What they said (their words) | Stuck? (no / a bit / needed help) |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |

**Words they used that the app doesn't:**

**Things they looked for and didn't find:**

**Things they said were wrong or unrealistic:**

**Answers to the end questions:**

## Afterwards

- Write up the sheet the same day, while you remember the tone.
- **This repository is public.** Don't commit anyone's name, employer or anything that identifies them. "Participant A, 12 years in a refinery control room" is enough.
- One person's opinion is a hint. The same thing from two or three people is a finding.
- Sort what you heard into three piles: **couldn't find it**, **found it but it's wrong**, and **it's missing**. The second pile matters most, because no test can find it.
- Bring the piles back, and they decide what gets built next.
