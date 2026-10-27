# Learning note 33: Administration, access control and the audit log

*This note goes with Phase 4 chunk 8. Choose the **System Admin** role: it now lands on **Administration** (`/admin`).*

## 1. Roles and the access matrix

Every person has one **role** (Executive, Field Technician, System Admin…). A role decides two things ([roles.ts](../../apps/web/src/shared/roles/roles.ts)):

- **Pages:** for each module, *use* (full access), *view* (look, don't change) or *no*.
- **Actions:** which buttons appear, e.g. only the HSE Officer can issue a permit to work.

**Administration → Roles and access** shows both tables. Admin can also change a person's role (**Users**), with one rule the server enforces: a role can never be left with nobody in it, or the work only that role does (approving work, issuing permits) would stop.

## 2. Checking access on every page, not just in the menu

Until now the menu hid modules a role can't use, but typing the address opened them anyway. Now the app shell works out which module any address belongs to (`/assets/CBC-GT-101/vibration` → Assets) and shows **"Not part of your role's view"** instead of the page. One check in one place covers every page, including ones added later.

**This is only half the job.** The screen is a convenience; anyone can send requests to a server directly. A real backend must check the role on every request and refuse data the person can't see. Security that only lives in the browser isn't security. The mock backend doesn't do this (it trusts the screen), which is fine for a demo and listed as something a real backend must add.

## 3. The audit log

"Who changed this, and when?" is the first question after anything goes wrong, and auditors ask it routinely. The log records **who**, **when**, **what** (the action), **which item** and, where useful, **what changed** ("High alarm 620.1 → 615").

**Written by the server, for every change.** It isn't written by each button. The server writes an entry for every successful request that changes something (anything but a read), whatever it is. Nobody has to remember to log a new action, so none can be forgotten. A refused request (bad input, a role left empty) isn't logged, because nothing changed.

## 4. Editing alarm limits

Each tag can have up to six limits: low trip < low alarm < low alert < high alert < high alarm < high trip. **Alert** is an early warning, **alarm** needs action, **trip** is where the protection system stops the machine.

Limits are edited where they're shown, in **Data → Tags → Edit limits**, by anyone with the `threshold.edit` permission: reliability engineers, condition analysts and the System Admin. You type in your own units, the app converts to SI, and both the screen and the server check the order.

**Finding a gap.** The plan said a limit edit "changes the simulation". Checking, only the random background alarms read a tag's limits. Alarms from **developing faults**, the ones that matter, used fixed fractions from the catalogue. Now they read the tag's current limits too. Lower an alert limit and that fault's alarm comes earlier; raise it past where the machine fails and there's no early warning at all. That's the real trade-off in setting limits: too tight and operators drown in alarms (note 16, ISA-18.2); too loose and warnings come too late. A test checks that a lower limit really means an earlier alarm.

## 5. The hierarchy browser

**Hierarchy** shows the enterprise as the platform sees it: enterprise → region → business unit → site → area → equipment. Each level loads only when you open it (**lazy loading**), so the page doesn't fetch all 1,870 assets at once. Each node shows its worst health, so problems are visible from the top.

## 6. Exercises

1. As System Admin, look at Roles and access. Which roles can approve work? Which can see Financials but not change anything?
2. Switch to Executive and type `/admin` in the address bar. What do you see, and why is this only half of real access control?
3. As a Condition Analyst, lower the high alert limit on a tag whose asset has a developing fault (try the Predictive console for one). Then, as System Admin, find the change in the audit log.
4. As System Admin, try moving all four ESG Leads to another role. What happens with the last one, and why?
