# Learning note 37: HTTP, REST, and the first server

*This note goes with Phase 5 chunk 1. Run `npm run dev:server` in one terminal and `npm run dev:connected` in another, then open the app as usual; or visit `http://127.0.0.1:4000/api/assets/CBC-GT-101` to see what the server sends.*

## 1. Two programs talking

Until now the "backend" lived inside the browser, in a Web Worker (note 1). Now there's a **server**: a separate program, here on your own computer, that the browser talks to over the network. Even on one machine they're two programs, and the only way between them is **HTTP**, the same protocol every web page uses.

An HTTP request has:

| Part | Example | Meaning |
|---|---|---|
| **Method** | `GET`, `POST` | Read something, or change something |
| **Path** | `/api/assets/CBC-GT-101` | Which thing |
| **Query** | `?limit=50&search="pump"` | Options for a read |
| **Headers** | `Content-Type: application/json` | Notes about the request |
| **Body** | `{"title": "Check the seal", …}` | The data for a change |

The answer has a **status code** (`200` all fine, `400` your request was wrong, `404` no such thing, `500` the server broke) and usually a body.

## 2. REST: addresses for things

**REST** is a convention for those addresses: a path names a *thing*, and the method says what to do with it. `GET /assets/CBC-GT-101` reads that asset; `POST /work-orders` creates a work order. Every endpoint in `packages/contracts` already had a method and path, written in Phase 1 for exactly this day.

## 3. The contract made this quick

Because every request and response was already defined (note 2), the server is small: **one route per endpoint**, made in a loop, each handing the request to the same simulation the browser used. The simulation already checks every input and output against the contracts, so the server inherits all that checking. A test confirms every endpoint has its route.

The web app needed one new piece, `HttpTransport`, next to the existing `WorkerTransport` (ADR-0004). It does the same job over HTTP, so **no page changed**. That's what "one switch point" bought us.

## 4. Getting values across exactly

A request's input can hold numbers, lists and nested objects. Query strings carry only text: does `?limit=50` mean the number 50 or the text "50"? Rather than guess per endpoint, every query value travels as **JSON**: `limit=50` is the number, `search="50"` is the text, `status=["open"]` is a list. Changes (`POST`) send their input as a JSON body. Browser and server use **one shared copy** of these rules (`contracts/src/http.ts`), with a test that every kind of value survives the round trip.

## 5. Errors without leaking

Every failure comes back in the contract's error shape with a matching status: a missing asset is `404`, a bad filter `400`. If the server hits a bug, it writes the details to **its own log** and tells the browser only "something went wrong on the server". Error details (file paths, stack traces) help attackers, so they stay on the server.

## 6. Checking what comes in

In the browser, the mock trusted the page that called it. A server can't: anyone can send it anything (`curl`, a script, a modified page). So everything that arrives is checked against a schema, including the simulation panel's controls, which became a schema for this reason.

That's also why **zod** was updated to 4.6.7 in this chunk: an advisory said earlier versions could run out of memory validating huge, specially shaped inputs. Harmless in a browser checking its own data; a way to knock over a server that checks data from the network. Keeping dependencies patched is part of running a server (`npm audit` lists known problems).

## 7. Not finished yet

- **Live values** still need a **WebSocket**, a connection that stays open so the server can push readings (chunk 2). Until then the "Key live values" stay empty in server mode, and the browser asks for the simulated time once a second.
- **Who you are** is, for now, just the role the browser names in an `X-Demo-Role` header. That's not security: anyone could send any role. Chunk 3 adds sign-in and sessions, and the server starts checking.

## 8. Exercises

1. Start the server and open `http://127.0.0.1:4000/api/assets/CBC-GT-101` in a browser. Now try an asset that doesn't exist. What status and body come back?
2. Open `/api/predictions?limit=2&status=["open"]`. Change `limit=2` to `limit=two`. What happens, and why is that better than guessing?
3. In server mode, open your browser's developer tools (Network tab) and click around. Find the request behind the Asset 360 page.
4. Why might sending error details to the browser be a security problem?
