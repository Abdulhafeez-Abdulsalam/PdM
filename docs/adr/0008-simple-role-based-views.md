# ADR-0008: Simple role-based views — not a security system

- **Status:** Accepted (replaces the spec's RBAC + ABAC with field-level checks)
- **Date:** 2026-10-10

## Context
The spec asked for role-based access control (RBAC) plus attribute-based access control (ABAC, e.g. "only sees solar sites in Region 2"), enforced at route, component and field level.

**Key fact:** anything the browser receives, a user can see using developer tools. A frontend can *hide* things but cannot *protect* them. Real protection must happen on the backend, which refuses to send data the user may not have.

## Options considered
1. **Full RBAC + ABAC in the frontend** — lots of code that looks like security but isn't.
2. **No roles at all** — everyone sees the same app, including admin and budget pages. Loses the spec's role-tailored experience.
3. **Simple role-based views** — roles decide what is *shown*, for usability. Security is documented as a backend responsibility.

## Decision
Option 3.

- 11 roles, defined in one file: `apps/web/src/shared/roles/roles.ts`.
- For each role: its **home page**, the **modules** it sees (use / view-only / hidden), and the **actions** it may take (e.g. `alarm.acknowledge`, `workOrder.approve`).
- Two helpers: `canSee(module)` hides menu items and pages; `canDo(action)` hides buttons.
- A **role switcher** in demo mode lets anyone try each role.
- **Not included:** attribute rules (region, site, asset class), field-level hiding.

The full matrix is in [the information architecture](../03-information-architecture/README.md#4-role-to-module-matrix).

## Consequences
- ✅ Each role gets an app that fits their job.
- ✅ Small, easy to understand and test.
- ⚠️ **This is not security.** A real deployment needs the backend to check every request. This must be written into the backend's requirements.
- Adding attribute rules later means extending the same two helpers; screens won't change.
