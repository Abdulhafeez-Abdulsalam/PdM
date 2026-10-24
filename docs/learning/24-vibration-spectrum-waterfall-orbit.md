# Learning note 24: Vibration spectra, waterfalls and orbits

*This note goes with Phase 3 chunk 7. Open any rotating machine in Asset 360 and choose the new **Vibration** tab. Good ones to try: pump **PBU-PMP-106** (a worn rolling bearing) and compressor **GCM-CMP-105** (heading for surge).*

## 1. One number isn't enough

Until now, a machine's vibration was one number: its **overall level** in mm/s (millimetres per second, how fast the bearing housing moves back and forth, averaged as an RMS). That number says *how much* the machine shakes, not *why*. Two machines at 6 mm/s can have completely different problems.

The **spectrum** splits the shaking into frequencies, the way a music app's equaliser splits sound into bass and treble. The maths that does it is the FFT (fast Fourier transform); the result is a set of **lines** (here 480), each saying "this much vibration at this frequency".

## 2. Every fault shakes at its own frequency

Frequencies are best read as **orders**: multiples of running speed. A pump at 2,975 rpm turns 49.6 times a second, so 1× is 49.6 Hz, 2× is 99.2 Hz, and so on.

| Fault | Where it shows | Why |
|---|---|---|
| **Unbalance** | 1× | a heavy spot goes round once a turn |
| **Misalignment** | 2× (as big as 1×) | shafts not in line flex twice a turn |
| **Rolling bearing, outer race** | BPFO and its harmonics | every ball strikes the damaged spot |
| **Rolling bearing, inner race** | BPFI, with sidebands ±1× | the damage turns with the shaft, so the impacts rise and fall once a turn |
| **Oil whirl** (journal bearings) | about 0.43× | the oil film drags the shaft round at just under half speed |
| **Flow instability** (near surge) | broad energy below 0.35× | the flow through the machine is breaking up |
| **Vane pass** (pumps) | vanes × running speed | normal: each impeller vane passing the casing |

The bearing frequencies come from the bearing's geometry ([vibration.ts](../../packages/contracts/src/vibration.ts), `bearingOrders`). For *n* balls and r = ball diameter ÷ pitch diameter:

- BPFO = n/2 × (1 − r), the outer race
- BPFI = n/2 × (1 + r), the inner race

For the 6309 bearing in the demo pumps, these come to 3.04× and 4.96×. These aren't whole numbers. That's how an analyst tells a bearing defect from ordinary harmonics: BPFO at 3.04× sits less than two lines from 3×, so the app looks for peaks within one line of each frequency. Bearing faults also show up long before the overall level alarms. On the demo pump, the spectrum says "Watch" weeks before the overall level passes its alert limit.

## 3. How the mock makes believable spectra

[packages/mock-data/src/vibration.ts](../../packages/mock-data/src/vibration.ts) builds each spectrum from two parts:

1. **The machine's healthy pattern:** 1×, a little 2× and 3×, vane pass on pumps, and a low noise floor. About one machine in ten is slightly misaligned, with a big 2×. That's realistic, and it gives the "watch" findings on otherwise healthy machines.
2. **Each active fault's pattern:** BPFO and its harmonics, or BPFI with sidebands, or whirl, or low-frequency flow noise. A late-stage bearing fault also raises the floor into a "haystack".

The two parts are added as **energies**, not amplitudes (RMS² adds), and scaled so the total equals the vibration **tag's** reading at that moment. So the tag, its alarms and the spectrum always agree; the spectrum just explains them.

## 4. The waterfall: what changed?

One spectrum is a snapshot. The **waterfall** stacks the last 13 weekly measurements, newest in front, each a step up and to the right. A peak that grows over the weeks rises out of the floor like a **ridge**. That shows a fault getting worse, and how fast. The table view gives the same story as numbers: the key peaks week by week.

Each measurement is taken while the machine is running, as on a real data-collection route. If a machine was stopped when a reading was due, the mock looks back up to a day for a moment it was running.

## 5. The orbit: how the shaft actually moves

Big machines (turbines, compressors, generators) run on **oil-film (journal) bearings**, with no balls, so they have no bearing defect frequencies. Instead they carry two **proximity probes** at right angles that measure the shaft's position directly, in µm (micrometres). Plotting one probe against the other gives the **orbit**: the path of the shaft centre.

- A **clean ellipse** is normal (1×).
- A **banana or figure-eight** means a strong 2×: misalignment.
- **Loops inside the orbit** mean something slower than the shaft, such as oil whirl.
- The **dots** are the once-per-turn mark (keyphasor). If the dots wander, something isn't locked to running speed.

The app converts each peak from velocity to displacement: displacement amplitude = √2 × v ÷ (2πf). That's why the same mm/s means far fewer µm at high speed. Pumps and ESPs (electric submersible pumps) run on rolling bearings and have no probes, so the page says so instead of drawing an orbit.

## 6. Design choices worth noticing

- **One rule set, used twice.** The server's diagnosis and the page's marker table use the same helpers from the contracts package (`vibrationMarkers`, `peakAt`), so they can't disagree about where BPFO is.
- **"Watch" versus "Act".** A finding is "act" once the overall level is past its alert limit. Before that it's "watch". Catching it early is the point of looking at the spectrum.
- **Worst point first.** Machines with two bearings open on the one that's worse against its alert limit, as an analyst would.
- **Accessible charts.** Like the others: arrow keys move a cursor along the spectrum, each chart has a summary for screen readers, and "Show as table" gives every number. Marker labels that would overlap are stacked in rows.

## 7. Exercises

1. On **PBU-PMP-106**, open the spectrum table. What is BPFO in Hz, and how does it compare with 3×?
2. Use "Spectrum from" to go back to the oldest measurement. Was the bearing finding there yet? Was it "Watch" or "Act"?
3. On **GCM-CMP-105**, switch between bearing 1 and bearing 2. Which shows the flow problem, and where in the spectrum?
4. Find a healthy machine whose only finding is misalignment. What would you check at its next stop?
