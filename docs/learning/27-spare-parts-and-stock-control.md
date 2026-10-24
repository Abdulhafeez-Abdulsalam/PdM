# Learning note 27: Spare parts and stock control

*This note goes with Phase 4 chunk 2. Choose the **Procurement** role: it now lands on **Inventory**. Open a part, for example the pump bearing **SP-BRG-6309**.*

## 1. The question

A prediction that says "this pump's bearing will fail in about three weeks" is only useful if the bearing is on the shelf, or can get there in time. Spare parts are a balance: too few and a failure waits weeks for a part; too many and money sits on shelves (this demo holds about $12 million of stock). Stock control is how plants strike that balance.

## 2. Reorder point and max

Each **stock line** is one part at one site ([inventory.ts](../../packages/mock-data/src/inventory.ts)):

- **Annual demand** = assets × (failures a year + PM replacements a year) × parts per job. Failures come from each mode's Weibull life (note 22), PM replacements from the PM plans (note 26).
- **Lead time**: how long an order takes to arrive. Here 2 to 17 weeks; real lead times for big rotating-equipment parts can be much longer.
- **Lead-time demand** = annual demand × lead time ÷ 365: what you expect to use while an order is on its way.
- **Safety stock** = z × √(lead-time demand), for the surprises. Failures arrive randomly, and for random arrivals the spread grows with the square root of the average. z sets how sure you want to be: 2.05 for **vital** parts (about 98 % of the time you won't run out), 1.65 for **essential**, 1 for **desirable**.
- **Reorder point** = lead-time demand + safety stock. When *on hand + on order* falls to it, order.
- **Max** = reorder point + a quarter's demand. Order back up to here.

"Vital, essential, desirable" (VED) is the usual way to rank parts by what happens without them: here, by how critical the equipment they serve is.

## 3. The forecast: two kinds of demand

Ordinary stock control only knows averages. A predictive maintenance system also knows *who* will need a part and *when*:

| Source | Example | When it's needed |
|---|---|---|
| PM plan | Compressor seal kits for every compressor whose planned replacement falls due | Its due date (overdue ones: now) |
| Failure prediction | 2 × 6309 bearings for PBU-PMP-106, predicted to fail in about 3 weeks | Its median remaining life |

Look at SP-BRG-6309: it has **no PM plan**. Bearing wear is condition-based (note 26), so bearings aren't replaced on a calendar. Its demand comes only from predictions. Predictions turn "random" failures into planned ones, and they're why the vital bearing can be ordered in time.

## 4. Statuses

| Status | Meaning |
|---|---|
| **Will run short** | Some need comes before a new order could arrive, and the shelf plus what's already on its way won't cover it. Order now, and expect it to be late: the "order by" date is often already past |
| **Reorder** | On hand + on order is at or below the reorder point |
| **OK** | Neither |
| **Overstocked** | Over 1.5 × max with nothing needed: money on a shelf |

"Will run short" walks through the needs in date order, adding each order on the day it arrives. That's why a line can be short even with plenty on order: the order arrives after the need.

## 5. The loop with work orders

- A **work order's page** shows the parts it will use (from its PM plan, or the predicted failure mode) and whether its site has them, so a planner sees a missing part *before* sending a technician.
- When work that replaced parts is **closed out**, those parts leave stock. The next reorder check sees the lower level.
- **Ordering** (Procurement and the Maintenance Planner) creates a purchase order that arrives after the part's lead time.

## 6. Design choices worth noticing

- **Computed, not stored.** On hand isn't a number we keep updating. It's worked out each time: starting stock + orders received − parts used by closed-out work. Nothing can get out of step.
- **A screen-reader bug found by a test.** The Order button's name came out as "Order 21of SP-CMP-ELP": a space at the start of hidden text is dropped when the name is worked out. The fix (the space outside the hidden part) also applied to a solar heat-map tile from Phase 3.
- **Procurement's home page** became Inventory automatically, as the information architecture planned: until a role's module exists, it lands on the Command Center.

## 7. Exercises

1. Open the first "Will run short" line. Why is it short? When would an order placed today arrive, and when is the part needed?
2. Open SP-BRG-6309. Which assets will need it, and why is there no PM plan?
3. Place an order for a "Reorder" line. What changed on the line?
4. As Maintenance Planner, raise the work for a PM plan with planned replacements (note 26) and open one of its work orders. Are the parts on the shelf?
