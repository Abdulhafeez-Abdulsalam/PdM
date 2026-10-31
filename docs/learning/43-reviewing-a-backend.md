# Learning note 43: Reviewing a backend

*This note goes with the [Phase 5 review](../phase-5-review.md). Read the review's "Found and fixed" and "Gaps" sections alongside it.*

## 1. Test in the mode people will use

Every acceptance criterion had passed for weeks, **in demo mode**. Running four of them against the real server found a problem in the first hour: opening a dialog broke the Content Security Policy. Nothing in the dialog had changed. What changed was the *environment*: only the real server sends the policy. Tests prove things about the setup they run in, so the setups that matter each need their own run. That's why there are now two suites, `npm run e2e` (demo) and `npm run e2e:server` (real server).

A second lesson from the same bug: chunk 6 checked the policy by *loading* every page. Loading isn't using. The dialog's style is only added when a dialog opens. A check is only as good as what it actually does.

## 2. A nonce: allowing one thing without allowing everything

The quick fix would have been `style-src 'unsafe-inline'`, which lets *any* inline style through, including one slipped in by an attacker. Instead, every copy of the page gets a **nonce** ("number used once"): a fresh random code in the policy, `style-src 'self' 'nonce-Xk3…'`, and in the page. The app gives it to the library that adds the dialog's style, and the browser allows styles carrying exactly that code. An attacker's markup can't know it: it changes on every load.

## 3. Measure, don't assume

ADR-0015 said a restart costs "about 0.7 s per simulated day". That was measured over one day. Over 30 days it took 99 seconds, not 21. A number that grows faster than expected usually means some list keeps growing and something scans it repeatedly. Here, the alarm list grows without end in an unattended demo, and every simulated minute looked through all of it. The review measures, finds the cause, and *records* the fix (indexes and snapshots) for a decision, rather than rushing a change to a 565-line engine at the end of a phase.

## 4. Security advisories are routine

`npm audit` showed new advisories today. The response is the same every time:

1. **Where does the package run?** `undici` sits under `jsdom`, which only runs tests; `seroval` sits inside the page router, in the browser.
2. **Is the problem reachable?** `seroval`'s issue needs untrusted data turned into script, which this app never does. Still worth fixing when the fix is small.
3. **Is the fixed version old enough to trust?** A release only hours old is where supply-chain attacks hide; both fixes were two weeks old.
4. **Write down what's left and why**: 15 findings in lint tooling and start-up file listing, with no non-breaking fix yet.

## 5. Exercises

1. Run `npm run e2e:server` and find the test named "the overlays open under the Content Security Policy". What would it report if the nonce weren't passed to `get-nonce`?
2. Open the app with `npm start`, view the page source, and find the `csp-nonce` meta tag. Reload: is it the same?
3. In the review's restart table, how long would you guess 60 simulated days would take? Why does a growing list make it worse than twice 30 days?
4. Run `npm audit`. For one finding, answer the four questions in section 4.
