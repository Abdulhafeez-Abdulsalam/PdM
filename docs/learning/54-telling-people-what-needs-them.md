# Learning note 54: Telling people what needs them

_This note goes with Phase 7 chunk 2. Press the bell at the top of the app, then change **Viewing as** and press it again._

## 1. Push, not pull

Until now the app waited to be asked: if a job was assigned to you, you found out when you looked. A notification centre turns that round. The bell tells each person what needs them, and each item takes them straight to it.

## 2. Worked out, not stored

The obvious design stores a list of messages for each person. The trouble is keeping it true: if someone else acknowledges an alarm, every stored copy is out of date.

So nothing is stored except what a person chose. Each time, the list is worked out from the plant: "urgent alarms at my sites in the last day, my open jobs, likely failures". An alarm someone acknowledged simply stops being unread. This is called **derived state**: if you can work something out from what you already have, don't keep a second copy that can drift.

## 3. Who hears what

Good notifications are mostly about what you leave out. If everything pings, people stop looking. An operator hears about P1 and P2 alarms; an executive only P1; a technician about their own jobs. The rules sit in one small table in `packages/mock-data/src/notifications.ts`.

## 4. A change that isn't an audit event

Every change in this app goes in the audit log, and a test insists every change needs a permission. Reading a notification is an honest exception: it changes nothing in the plant, only that person's own view. So it's kept across restarts in the command log, but left out of the audit log, and the test now names these two exceptions and no others. A rule with a named exception is still a rule.

## 5. The simulated operator

With nobody working alarms, about 33 an hour piled up, and the bell would have been useless. A few lines in the alarm engine now act as someone on shift: low-priority alarms with no real fault behind them get acknowledged 5 to 45 simulated minutes after they sound. The delay comes from a hash of the alarm number, not a random number, so a restart replays exactly the same thing.

## 6. Exercises

1. Compare the bell for **Field Technician** and **Maintenance Planner**. Why do they differ?
2. As an operator, acknowledge an urgent alarm from the alarm list. What happens to the bell, and which code made that happen?
3. Why is a hash better than `Math.random()` for the delay? (Think about what a restart does.)
4. Add a rule: tell the HSE officer about something new. Which one file would you change?
