# Contributing

Thank you for wanting to help. This guide covers setting up, the checks every change must pass, and the rules the code follows. If something here is unclear, that's worth an issue too.

## Setting up

You need **Node.js 24** and npm, and **Google Chrome** for the browser tests.

```bash
npm install      # also installs the git hooks
npm run dev      # the app in demo mode → http://localhost:5173
```

The [README](README.md) explains the two modes (demo, and with the server) and every command.

## How changes are made

- **Small steps.** One change at a time, each complete: code, tests, and the docs it affects. A change that's hard to describe in one sentence is probably two.
- **Branch from `main`** and open a pull request. CI runs on it (formatting, types, lint, unit tests, the server browser tests, and the component catalogue's accessibility checks); it must be green.
- **Before every commit, `npm run check`** (about ten minutes). It's what CI runs first.
- **When a change touches what people see or do**, also run the browser tests that cover it: `npm run e2e -- -- -g "<part of a test name>"` (all of them take about twenty minutes), and `npm run e2e:server` if the server is involved.
- **When a change touches a shared component** (`packages/ui`, `packages/charts`), run `npm run test:stories`. If the look changed on purpose, save the new screenshots with `npm run test:stories -- -- --update-snapshots`, **look at them**, and commit them with the change.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), checked by a git hook:

```
type(scope): what changed, in lower case

Why, in a few lines, if it isn't obvious.
```

- **type**: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style` or `revert`.
- **scope**: the workspace or area, e.g. `web`, `server`, `mock-data`, `contracts`, `ui`, `charts`, `catalogue`.
- The summary starts with a **lower-case** letter (the hook rejects "Storybook…" but accepts "a component catalogue in Storybook…").

The pre-commit hook lints and formats the files you're committing.

## Rules the code follows

These are what reviews look for. Most are enforced by lint or tests.

1. **Contracts first.** Every piece of data that crosses between the app and a backend has a Zod schema in `packages/contracts`. Change the contract, then the simulation (`packages/mock-data`) and the server, then the app. See [the data contracts](docs/04-data-contracts/README.md).
2. **Package boundaries.** `contracts`, `ui` and `charts` import none of our other packages; `mock-data` and `api-client` only `contracts`. Lint enforces this ([architecture §3](docs/01-architecture/README.md)).
3. **Both backends behave the same.** The app never knows whether it's talking to the in-browser simulation or the server. Role checks live in the shared rules (`packages/contracts/src/access.ts`), so the server enforces exactly what the screen offers.
4. **No raw colours.** Components use the design tokens (`text-health-critical`, `bg-surface`…), so all three themes work. See [the design system](docs/02-design-system/README.md).
5. **All text in one place.** Every word a user sees is in `apps/web/src/shared/text/en.json`, written plainly: short sentences, no jargon a technician wouldn't use.
6. **Accessible by default.** Everything works with the keyboard; every control has a name; status is never shown by colour alone; charts have a text summary and a table or cursor alternative; nothing breaks at phone width. axe runs on every screen and every story, in every theme. Automated checks catch only part of it, so for bigger changes walk through the relevant journeys of the [screen-reader script](docs/testing/nvda-script.md).
7. **Tests describe behaviour.** Test what a person sees and does (find things by role and name, as a screen reader would), not how the code is arranged. A fixed bug gets a test that fails without the fix.
8. **Nothing secret in the repository.** No keys, passwords or personal data. `.env` files are ignored; settings are environment variables ([ADR-0017](docs/adr/0017-running-the-server.md)).
9. **Pin new dependencies exactly**, choose versions at least a couple of weeks old, and run `npm audit` before and after.

## Recording decisions

A decision someone might later ask "why?" about gets an **ADR** in [`docs/adr`](docs/adr/README.md): the context, the options, what was chosen and what follows. Never rewrite an accepted ADR; write a new one that supersedes it.

## Reporting a security problem

Please don't describe it in a public issue. Open an issue asking for a private way to get in touch, without the details, and you'll be contacted.

## Licence

By contributing, you agree that your contribution is licensed under the [MIT licence](LICENSE), like the rest of the project.
