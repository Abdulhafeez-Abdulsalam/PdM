# Learning note 38: WebSockets, and one plant for everyone

*This note goes with Phase 5 chunk 2. Run `npm run dev:server` and `npm run dev:connected` as in note 37, then open the app in **two** browser windows side by side.*

## 1. Asking vs. being told

HTTP (note 37) is *ask, then answer*: the browser asks, the server replies, done. That's perfect for "show me this asset", but useless for "tell me when the exhaust temperature changes", because the browser can't know when to ask. It could ask every second (**polling**), which is what chunk 1 did for the simulated clock: lots of requests, mostly answered "nothing new".

A **WebSocket** turns it around. The browser opens one connection, and it **stays open**. Either side can send a message at any time. The browser says once "I'm watching these 12 tags"; from then on the server sends new values as they happen. It starts life as an ordinary HTTP request asking to "upgrade" (you'll see status `101 Switching Protocols` in the Network tab), then becomes a two-way pipe.

## 2. The same messages as the worker

In demo mode the Web Worker already talked in messages: `subscribe_tags`, `tag_values`, `alarm_changed`, plus a `status` with the simulated time (note 1, ADR-0005). The WebSocket carries **exactly those messages**, as JSON text. That's why no page changed again: `HttpTransport` hands them to the same `LiveClient` the worker's messages go to.

The one new piece in the browser is **reconnecting**. Networks drop; servers restart. When the connection closes, the transport waits 1 second and tries again, then 2, 4, 8, at most 10 seconds (**backoff**, so a stopped server isn't hammered). A new connection knows nothing about you, so the transport remembers what you were watching and **says it again**. Try it: stop the server, watch the offline banner, start it again.

## 3. One plant, one clock

The simulation now runs **on the server**, once, for everyone. It ticks once a second and pushes the status (time, speed, chaos mode, storyline) to every connected browser. Change the speed in one window and the other window's clock speeds up too. That's what "shared state" means: there's one copy of the truth, and everyone sees it.

That sharing exposed a hidden assumption. The simulation kept a list of "alarms that changed since last time" and handed it to whoever asked first, which was fine with one connection (the worker). With two browsers, the first took the list and the second got nothing. Now the list is collected **once per tick** and given to every connection. A test opens two connections and checks both hear about an acknowledged alarm; it fails on the old code.

## 4. Don't trust what comes in (again)

Anyone can open a WebSocket and send anything, so every message is checked against the `ClientMessage` schema. A bad one gets an error reply; the connection stays open. Messages are capped at 64 KB, and a browser too slow to keep up is cut off (it reconnects).

There's a less obvious risk too. Browsers let **any web page** open a WebSocket to **any address**, your own computer's included. A page on some other website could quietly connect to `127.0.0.1:4000` while you browse. So the server checks the **`Origin`** header, which the browser fills in and a page can't fake: if the connection doesn't come from a page on this same site, it gets `403 Forbidden`. This matters even more in chunk 3, when connections carry your sign-in cookie.

## 5. Exercises

1. Open the app in two windows. Start the storyline in one. What happens in the other, and why?
2. In the Network tab, filter by "WS", click the `live` connection and open **Messages**. How often do `tag_values` arrive? What's in a `status` message?
3. Stop the server (Ctrl+C) while watching the Messages tab and the page. How long until the app notices? Start it again: what does the browser send first on the new connection, and why?
4. Why is polling once a second worse than a WebSocket for 300 tags? Think about requests per minute, and how stale a value can be.
