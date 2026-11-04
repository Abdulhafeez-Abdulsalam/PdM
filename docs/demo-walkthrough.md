# Demo walkthrough

A 15–20 minute script for showing PdM to stakeholders. It follows one fault from its first faint sign to a verified repair, through the people who live it: an executive, an analyst, a control room operator, a planner, a technician and a reliability engineer.

**The story in one sentence:** gas turbine CBC-GT-101's compressor is slowly fouling. PdM predicts the failure days before any alarm, the team fixes it in a planned stop for about $24K, and a failure that would have cost about $2.4M never happens.

Every step here is also acted out by an automated test (`apps/web/e2e/walkthrough.spec.ts`), so the script can't drift from the app. It takes the [README's screenshots](screenshots/) too (`npm run demo:screenshots`).

## Before you start

1. Run `npm run dev` and open http://localhost:5173 in Chrome, full screen. Use demo mode: the storyline controls are in the **Simulation** panel, at the bottom of the left menu.
2. **Reload the page just before you begin**, to start from a fresh plant.
3. **After that, never reload.** In demo mode the plant lives in the page: a reload starts it again and the story is lost. Move around with the menus only.
4. Set **Viewing as** to **Executive / VP Ops**. Check **Speed** is 1×.
5. Rehearse once. The numbers shift a little from run to run, so say "about".

**How time works:** you can't pause, but at 1× a simulated second is a real second, so the plant is as good as still while you talk. Set **Speed** to **3600×** (an hour a second) to run to the next stage, and watch the stage name in the Simulation panel. When it changes, set Speed back to **1×**. The whole week takes about two and a half minutes of fast-forward.

| Scene | Who | Stage to reach | Minutes |
| --- | --- | --- | --- |
| 1. The company at a glance | Executive | | 2 |
| 2. The fault begins | | Anomaly detected | 2 |
| 3. The model sees it first | Analyst | Prediction raised | 3 |
| 4. The alarm, and two clicks | Operator | Alarm raised | 3 |
| 5. Planning the work | Planner | | 2 |
| 6. In the field, out of signal | Technician | | 2 |
| 7. Fixed, and proven | Reliability engineer | Recovery verified | 3 |
| 8. What it was worth | Executive | | 2 |

## Scene 1: the company at a glance (2 minutes)

**Viewing as:** Executive / VP Ops. **Page:** Command Center.

> This is PdM. It's for an energy company in oil and gas, gas-to-power and solar: thousands of machines, and the question is always the same: what's about to fail, and what's it going to cost us? Everything you see is simulated: the plant, the people and the money.

**Show:** the row of numbers at the top, then **Top risks**: each asset, what's predicted, how likely, and how soon. Then the **Daily briefing** on the right.

> An executive gets this first thing each morning: what changed overnight and what needs attention, in plain words. Each line links to its evidence.

**If asked** about roles: there are eleven, each with its own home page and only the actions it may take. **Viewing as** switches between them; with the real server, you sign in instead.

## Scene 2: the fault begins (2 minutes)

**Do:** in the Simulation panel, press **Start demo storyline**. It says *Fouling begins*.

> We've just started a real kind of fault on a gas turbine, CBC-GT-101. Dirt is building up on its compressor blades. It's invisible at first: nothing alarms, and the turbine keeps running.

**Do:** set **Speed** to **3600×**. After about 20 seconds it says *Anomaly detected*. Set **Speed** to **1×**.

> About a day has passed. Efficiency has drifted less than half a percent. No limit has been crossed, so a traditional system says nothing. But the pattern has changed.

## Scene 3: the model sees it first (3 minutes)

**Do:** set **Viewing as** to **Condition Monitoring Analyst**. Set **Speed** to **3600×**. After about 20 seconds it says *Prediction raised*. Set **Speed** to **1×**.

**Do:** open **Predictive & AI** in the left menu. Find **Compressor fouling** on **CBC-GT-101** in the list and open it.

> The list is ranked by money at risk, not by how loud the alarm is. Here's our turbine. Remember: no alarm has fired yet.

**Show,** from the top:

- the **anomaly score** rising;
- **probability** and **confidence**: the model says how sure it is;
- **Recommended action**: schedule an offline water wash, and when by;
- **Cost to act now** about $24K against **Cost if it fails** about $2.4M;
- **Remaining useful life**: a range, not a false promise of one date;
- **Was the model right?**: after the repair, people record what they found, and that's how the models improve.

## Scene 4: the alarm, and two clicks (3 minutes)

**Do:** set **Speed** to **3600×**. After about 45 seconds it says *Alarm raised*. Set **Speed** to **1×**.

> Nearly two days after the prediction, compressor efficiency crosses its alert limit, and now the control room hears about it. With only an alarm system, this is where the story would begin.

**Do:** set **Viewing as** to **Control Room Operator**. Press **Ctrl+K**, type **CBC-GT-101**, wait for the asset to appear, and choose it (the line starting CBC-GT-101, not "Ask the copilot"). Open its **Alarms** tab.

**Do:** press the **Create work order** button on the top alarm (the clipboard icon). The form is already filled in, with a current snapshot of the readings attached. Press **Create work order**.

> Two clicks. From an alarm to a work order, assigned, with the evidence attached.

**If asked** why the alarm counts at the top are so high: nobody is working the other alarms in this simulation, so they pile up as we fast-forward. On a fresh start it's about a hundred active alarms. The alarm page watches for exactly this: it warns of a flood, following the ISA-18.2 alarm management standard.

## Scene 5: planning the work (2 minutes)

**Do:** set **Viewing as** to **Maintenance Planner**. Open **Maintenance**.

> The work order is here in the first column. Every job goes through the same steps, from request to verified repair, and only the moves your role allows are offered.

**Show:** the card for CBC-GT-101, its **Move to…** menu, and **Schedule board**, which shows who's free and when. Then go back to the board.

## Scene 6: in the field, out of signal (2 minutes)

**Do:** set **Viewing as** to **Field Technician**. Open **Field**, then the first job under **In progress**.

> This is a technician's phone. Each job has its safety steps and readings, and a hazardous job can't start without its permit.

**Do:** tick the first step and type a few words in **Findings**. In the Simulation panel, tick **Drop the connection**.

> Out of signal, as technicians often are. It says so at once, and everything typed is kept.

**Do:** untick **Drop the connection**.

> Back in coverage, nothing lost.

## Scene 7: fixed, and proven (3 minutes)

**Do:** set **Speed** to **3600×**. After about a minute it says *Recovery verified*. Set **Speed** to **1×**.

> The water wash is done and the job is closed out, with what failed and why recorded in the ISO 14224 standard. The plant has moved on a few days.

**Do:** set **Viewing as** to **Reliability Engineer**. Press **Ctrl+K**, type **CBC-GT-101**, and choose the asset. Open its **Telemetry** tab. Set the time range at the top to **Last 7 days**. In the sensor list, untick the two sensors ticked, and tick **Compressor isentropic efficiency**.

> This is the whole story on one time axis. The line falls through its alert limit and its alarm limit, then jumps back up. Underneath, on the same axis: the alarms, the work order, the prediction and the repair. You can see what happened, and in what order.

**Do:** drag the ends of the slider under the lanes to zoom in on the drop: the chart follows. Click a dot to see what it was. Press **0** to show everything again (click the lanes first).

## Scene 8: what it was worth (2 minutes)

**Do:** set **Viewing as** to **Executive / VP Ops**. Open **Financials**.

> Value from predictions: what the finished predictive jobs saved compared with what the failures would have cost. Our turbine adds to it: a $24K job instead of a $2.4M failure.

**Do:** press **Ask** at the top, or the **.** key. Choose a suggested question, such as *Which pumps are likely to fail in the next 30 days?*

> You can just ask. Each answer says where its numbers came from, and it can only use what your role may see. This copilot is scripted for the demo; it sits behind an interface a real AI model can plug into.

**Close:**

> One fault, seen days before any alarm, fixed in a planned stop, and the model told it was right, so it gets better next time. That's predictive maintenance.

## If something goes wrong

| What happens | What to do |
| --- | --- |
| You reloaded the page | The story restarts: press **Start demo storyline** and fast-forward to where you were (about 2 minutes) |
| You went past a stage at 3600× | Carry on: the app simply shows the later stage. If nobody made a work order, one is made for you at *Work order created* |
| The search shows "Ask the copilot" first | Wait a moment for the asset to appear, then choose the line starting CBC-GT-101 |
| The time range went back to 24 hours | Set it after opening the asset: moving through the search box doesn't keep it |
| A chart looks empty on Telemetry | Check the time range is **Last 7 days** |

## Questions you may be asked

- **Is this real data?** No: a detailed simulation, built so faults, alarms and repairs behave realistically. See [the simulated plant](05-mock-data/README.md).
- **Does it need a server?** The demo runs entirely in the browser. It also runs against a real server with sign-in, role checks and a database ([README](../README.md#with-the-server)).
- **Is the AI real?** The predictions and the copilot are simulated. The copilot sits behind a provider interface with role-filtered tools, ready for a real model ([ADR-0016](adr/0016-ai-provider-and-role-filtered-tools.md)).
- **Is it ready for production?** Not yet: it needs real data connections, real accounts, HTTPS, backups and monitoring ([ADR-0017](adr/0017-running-the-server.md)).
- **Is it accessible?** Every screen is checked automatically in all three themes, works by keyboard and fits a phone; a screen-reader pass by a person is [scripted](testing/nvda-script.md).
