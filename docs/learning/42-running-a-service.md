# Learning note 42: Running a service

*This note goes with Phase 5 chunk 6. Run `npm start`, open http://127.0.0.1:4000, and keep the terminal in view.*

## 1. Development vs. production

So far you've run two programs: Vite's dev server (fast reloads, the app's source files served one by one) and the API server behind it. That's great for working on the code and wrong for using it. **Production** means one program that serves the **built** app (`npm run build:connected` bundles it into a few files in `dist-server/`) and the API, from one address. That's what `npm start` does.

Built files are named after their content (`index-CMISySsL.js`). If the content changes, the name changes, so browsers can keep these files for a year (`Cache-Control: immutable`). But `index.html`, which says *which* files to load, is always checked again (`no-cache`), so a new version reaches everyone at once.

## 2. Settings live in the environment

A service shouldn't need its code edited to run somewhere else. Settings (port, database file, log level) come from **environment variables**, values given to the program when it starts. They're checked at start-up against a schema: `PORT=eighty` stops the server straight away with "PORT: expected number". Failing early and clearly beats failing later and strangely. Secrets, such as a future AI model's key, will come in the same way, and never live in a file in git.

## 3. Watching it run

- **Health check**: `/api/health` answers whether the server *and its database* are working. Whatever watches the service (a person, or a monitoring tool) asks it every few seconds.
- **Structured logs**: one JSON line per event (`{"level":30,"msg":"request completed","responseTime":2.1,…}`), so tools can search and count them. Cookies are blanked out: logs are read by more people than should see sign-in tokens.

## 4. Telling the browser what's allowed

**Security headers** are instructions the server sends with every page. The most powerful is the **Content Security Policy** (CSP): "this page may only run scripts from this site, only connect to this site and the map server, and may not be shown inside another site's frame." If an attacker ever slipped some HTML into a page (say, through a work-order description that wasn't escaped), the browser would refuse to run their script or send data elsewhere. It's a second wall behind the first.

The way to write one: start **strict**, browse every page, read the browser's complaints, and loosen only what's needed, writing down why. Here that was a single line, fonts as `data:` addresses. No `unsafe-inline`, which would undo most of the protection.

## 5. Limits and a clean stop

- **Rate limiting**: one address may try to sign in 10 times a minute; then the server answers `429 Too Many Requests` with `Retry-After`. Without it, a program could try sign-ins as fast as the network allows.
- **Graceful shutdown**: when asked to stop (Ctrl+C sends a signal called SIGINT; service managers send SIGTERM), the server stops taking new requests, finishes the ones in progress, closes connections, saves state and closes the database, with a 10-second limit in case something hangs. Pulling the plug instead risks a half-written file.

## 6. Exercises

1. Run `npm start`, then open `/api/health`. Stop the server with Ctrl+C and read the last log lines. What did it do before ending?
2. Start it with `PORT=eighty npm start` (PowerShell: `$env:PORT="eighty"; npm start`). What happens, and why is that better than starting anyway?
3. In the browser's developer tools (Network tab), click the page request and find `content-security-policy` in its response headers. Which sites may the page connect to?
4. Sign in 11 times within a minute (sign out in between). What does the 11th attempt say? Why is the limit per address rather than per person?
