# Learning note 55: Nobody answered (escalation and on-call)

_This note goes with Phase 7 chunk 3. On Alarms & Events, open **On call now**, then read the "escalated to" labels in the alarm list._

## 1. An alarm nobody hears is the dangerous one

Alarm systems assume someone is watching. But the operator may be dealing with something else, on a break, or swamped. **Escalation** is the safety net: if an urgent alarm isn't answered in time, it goes to the next person, then the next, until someone takes it.

## 2. Timers, without timers

It sounds as if each alarm needs a stopwatch. Instead, when an urgent alarm sounds, the engine writes down "check this one at minute X". Each simulated minute it looks only at what's due. If the alarm is still unanswered, it moves up and gets a new check; if someone answered, nothing happens. This is the same pattern as the simulated operator, and it stays fast with thousands of alarms because nothing else is looked at.

## 3. Working out who's on call

The roster isn't stored either. The person is worked out from the site and the shift number (the time divided by 12 hours). So the same time always gives the same person, and a server restart that replays the day gets exactly the same escalations.

## 4. Two writers, one log

A person's escalation is a request, so it reaches the audit log the usual way. An automatic one has no request behind it, so the engine tells the backend, which records it as done by "system". An audit log that left out what the system did by itself would miss the most important entries.

This changed something else: an old test checked that nothing was added to the audit log while time passed. That was true then. Now it isn't, so the test now states what it actually meant: notification actions are never audited.

## 5. Exercises

1. In the alarm list, press E on a row twice, then once more. What does the app tell you?
2. Why is a returned-to-normal alarm left alone by the automatic step, but can be sent up by hand?
3. Change `ESCALATION_MINUTES` so a P2 moves after 5 minutes. Which test fails, if any?
4. Who should be on the chain at your own workplace? Write it down as a list of roles.
