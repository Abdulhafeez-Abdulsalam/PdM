# Learning note 45: Continuous integration

*This note goes with Phase 6 chunk 1. Open the repository on GitHub and click **Actions**.*

## 1. What CI is

**Continuous integration** (CI) means every change is checked automatically, on a machine that isn't yours, as soon as it's pushed. You've run `npm run check` before every commit since Phase 1; CI runs the same thing again on GitHub, every time, without anyone remembering to.

Why bother, if the laptop already checks? Because the laptop has things the project doesn't: a file you forgot to commit, a package installed by hand, a cache. GitHub's machine starts **empty** every time: it takes only what's in the repository, installs exactly what the lockfile says (`npm ci`) and runs the checks. If it passes there, it will pass for anyone who clones the project.

## 2. How it's set up

A **workflow** is a file in `.github/workflows/` that says *when* to run (on every push, on a schedule, on a button) and *what* to run, as **jobs** made of **steps**. Ours:

- `ci.yml`, on every push and pull request, runs two jobs side by side on two machines: the full `npm run check`, and the browser tests against the real server.
- `e2e-demo.yml` runs the long demo-mode browser suite every Monday and when you press **Run workflow**.

Each step either uses a ready-made **action** (check out the code, install Node, keep a report) or runs a command.

## 3. Small habits that matter

- **Pin actions to a commit.** `actions/checkout@v7` points at whatever the `v7` tag points at today; tags can be moved. `actions/checkout@3d3c42e…` can't change. This is the same supply-chain care as not taking packages released hours ago.
- **Least privilege.** The workflows may only *read* the code (`permissions: contents: read`). If something malicious ever ran inside them, it couldn't push or change anything.
- **Name the machine exactly.** `ubuntu-24.04`, not `ubuntu-latest`, so the machine doesn't change under you without warning.
- **Time limits.** A stuck test would otherwise hold a machine for hours.
- **Keep evidence of failures.** When a browser test fails, its trace and screenshots are kept for 14 days, so you can see what it saw.

## 4. Reading the result

Each commit on GitHub gets a ✅ or ❌. Click it to see which job and which step failed, and the full log, just like your terminal. The badge at the top of the README shows the latest result on `main`.

## 5. Exercises

1. Open the repository's **Actions** tab. How long did each job of the latest run take? Why are they on two machines?
2. In `ci.yml`, find the line that limits what the workflow may do. What could a workflow do without it?
3. Start the demo-mode suite yourself: Actions → "Browser tests (demo mode)" → **Run workflow**. When it finishes, download the report it keeps.
4. Why does CI run `npm ci` rather than `npm install`?
