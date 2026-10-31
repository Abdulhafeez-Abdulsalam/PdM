# ADR-0014: Demo sign-in, sessions, and the server's role checks

- **Status:** Accepted
- **Date:** 2026-10-31

## Context
Until now the role was a picker on the screen ([ADR-0008](0008-simple-role-based-views.md)): it decided what each role was *shown*, and in Phase 5 chunk 1 the browser simply told the server which role it was playing (an `X-Demo-Role` header, [ADR-0012](0012-fastify-server-and-http-format.md)). Anyone could claim any role. The [Phase 5 plan](../phase-5-plan.md) asks for real sessions and for the server to check every request. Demo sign-in (choose a person, no password) was decided with the user.

## Options considered
For keeping someone signed in:
1. **A token the page stores and sends** (e.g. a JWT in `localStorage`): common, but any script that gets into the page can read it and send it elsewhere, and a signed token can't be withdrawn before it expires.
2. **A session cookie**: a random token in an `HttpOnly` cookie (invisible to the page's code), whose meaning only the server knows. Signing out deletes it on the server, at once.

For the rules: keep the role matrix in the web app and write the server's own copy, or **move it into `packages/contracts`** and use one copy in both.

## Decision
- **Sessions are server-side, in a cookie** (`@fastify/cookie`): `pdm_session`, 32 random bytes, `HttpOnly`, `SameSite=Strict`, path `/`. A fresh token at every sign-in; sign-out deletes it and closes that session's live connections. A session ends after 8 hours without a request. Kept in memory for now (a restart signs everyone out); chunk 4 stores them in SQLite. `Secure` is left off because the server runs on plain `http://` on this laptop; it must be on behind HTTPS (chunk 6).
- **Sign-in routes** (`contracts/src/http.ts`): `GET /api/session/people` (the only thing open without a session), `GET /api/session`, `POST /api/session { userId }`, `POST /api/session/end`.
- **One copy of the rules** in `contracts/src/access.ts`: the module matrix, the actions, who may move a work order, and a rule for **every endpoint** (the type makes a missing rule a compile error). The screens import it to decide what to show; the server imports it to decide what to allow.
- **The server checks every request**: no session → `401 unauthenticated`; the role may not → `403 forbidden` (two new `ApiError` codes). The live WebSocket needs a session too, and is closed with code 4401 when the session ends, so the browser shows the sign-in page.
- **Reads are open to anyone signed in; changes are guarded.** Pages share data across modules (the Command Center shows alarms, predictions and work orders to every role), so the matrix's "view"/"hidden" stays about what each role is *shown*. Every change needs its action; the audit log is for administrators only. Some rules depend on the input: a work order's move needs the action for its target status (reopening completed work is a verifier's call), a new work order's depends on its source, an MOC's on whether it's being reviewed or implemented.
- **"Use" means act.** RCAs had no button rule, so anyone who could see Reliability could edit them; now only roles with "use" of Reliability can (`rca.edit`), on the screen and on the server.
- **The simulation answers as the signed-in person.** The mock's "me" (who acknowledged, who raised a work order) and the audit log record the real person. A role change by an administrator applies to that person's next request, because the session holds the person, not the role.
- **Requests from other sites are refused**: changes must be JSON (a plain-text POST is refused, 415), and a browser's change or live connection must come from a page on this server's own address (`Origin`, 403).
- **Demo mode is unchanged**: no sign-in, and the role picker chooses the role. Server mode shows a sign-in page listing the demo people, and "Signed in as … · Sign out" in place of the picker.

## Consequences
- The X-Demo-Role header is gone; the simulation panel can no longer change the role on the server (403).
- What a button shows and what the server allows can't drift apart, and a test checks the web app's modules match the contracts' list.
- People still live in memory with the simulation; chunk 4 moves people, sessions and the audit log into SQLite.
- Not yet: passwords or a company login, limiting sign-in attempts (chunk 6), finer scoping (e.g. a technician seeing only their own site), and `Secure` cookies behind HTTPS.
