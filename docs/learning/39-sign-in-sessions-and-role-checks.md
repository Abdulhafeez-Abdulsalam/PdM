# Learning note 39: Signing in, sessions, and who may do what

*This note goes with Phase 5 chunk 3. Run `npm run dev:server` and `npm run dev:connected`, then open the app: you'll meet the sign-in page.*

## 1. Two questions: who are you, and may you?

Security on a server is two separate questions:

- **Authentication**: *who are you?* Proving identity: a password, a company login, here a demo choice of person.
- **Authorisation**: *are you allowed to do this?* Checking that person's permissions for each request.

Mixing them up is a classic mistake. Being signed in (authenticated) says nothing about whether you may acknowledge an alarm (authorised). The server answers them with different status codes: **401** "I don't know who you are, sign in" and **403** "I know who you are, and you can't do that".

## 2. Sessions and cookies

HTTP forgets everything between requests (note 37). So after you sign in, how does the next request say "it's still me"?

The server makes a **session**: it picks a long random token (32 random bytes, far too many to guess), remembers "this token belongs to Kofi Nakamura", and gives the token to the browser in a **cookie**. A cookie is a small value the browser stores per site and attaches to every request to that site **by itself**. The page's code doesn't have to do anything.

Three settings on the cookie matter:

- **HttpOnly**: the page's own JavaScript can't read it (`document.cookie` shows nothing). If a malicious script ever got into the page, it still couldn't steal the session.
- **SameSite=Strict**: the browser doesn't attach it to requests started by other websites.
- **Secure** (later): only send it over HTTPS. Off for now, because the server runs on plain `http://` on your laptop.

Signing out deletes the session **on the server**, so the token becomes worthless at once, even if someone had copied it. That's the big advantage over tokens the page stores itself (such as JWTs in `localStorage`), which stay valid until they expire.

## 3. One copy of the rules

Before this chunk, the role matrix lived in the web app and decided what each role *sees*. Hiding a button is good design, but **it isn't security**: anyone can send the request anyway (try it with `fetch` in the developer tools). The server has to check.

If the screen and the server had separate copies of the rules, they'd drift: a button shown that the server refuses, or worse, a request the server allows that should have been refused. So the rules moved to `packages/contracts/src/access.ts`, which both import. Every endpoint has a rule there, and TypeScript refuses to compile if one is missing.

Some rules depend on the request itself. Moving a work order to "approved" needs the plant manager; moving it to "in progress" needs a technician; reopening completed work needs a verifier. So the rule looks at where the work order is now and where it's going.

## 4. Defence in depth

Several smaller protections stack up:

- **The session holds the person, not the role.** If an administrator changes your role, your very next request is checked against the new one.
- **Fresh token at every sign-in**, so a token someone saw before you signed in is useless.
- **Requests from other sites are refused.** Your browser would happily send a request from some other web page to `localhost`, cookie and all. So changes must be JSON (a plain-text POST is refused), and the server checks the `Origin` header the browser adds.
- **Errors say little.** A 403 says the role can't do that; it doesn't list what the role *could* do.

## 5. Exercises

1. Sign in as an executive, open the developer tools console and run `fetch("/api/admin/audit").then(r => r.status)`. What comes back, and why is that the server's job rather than the menu's?
2. Run `document.cookie` in the console. Why is it empty, even though you're signed in?
3. Sign in as an operator in one window and an administrator in another. As the administrator, change the operator's role (Admin › Users). What happens to the operator's next acknowledge?
4. Stop and restart the server. What happens to your session, and why? (Chunk 4 changes this.)
