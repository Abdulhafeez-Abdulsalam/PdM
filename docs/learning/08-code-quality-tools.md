# Learning note 08 — Code quality tools

*Goes with the code-checking setup before Phase 2. Install the recommended VS Code extensions when prompted.*

## 1. Four tools, four jobs

| Tool | Job | When it runs |
|---|---|---|
| **TypeScript** | Are the types right? | `npm run typecheck`, and live in VS Code |
| **ESLint** | Is this code likely to have a bug, or break a team rule? | `npm run lint`, live in VS Code, and on commit |
| **Prettier** | Is it laid out consistently? (spaces, line breaks, quotes, class order) | On save in VS Code, and on commit |
| **commitlint** | Does the commit message follow the convention? | On commit |

**Husky** installs git *hooks* — scripts git runs at certain moments. Ours: before a commit, run ESLint and Prettier on the changed files (via **lint-staged**); when writing the message, run commitlint.

`npm run check` runs everything, the same as a CI server would.

## 2. Why Prettier and ESLint are separate

Arguing about formatting is a waste of review time. Prettier just decides — consistently. ESLint is then left to the interesting question: *is this a bug?* `eslint-config-prettier` switches off any ESLint rules that would argue with Prettier.

## 3. What ESLint found on day one — and why each mattered

Only 13 findings in the whole codebase, but several were real:

| Rule | What it caught | Why it matters |
|---|---|---|
| `react-hooks/immutability` | The alarm table changed a variable *while drawing* | React may draw a component twice; the second time the group headings would be wrong |
| `react-hooks/set-state-in-effect` | Registry page reset its page number in an effect after filters changed | Two renders per change, one of them showing a page number that no longer makes sense |
| `react-hooks/purity` | `Date.now()` called while drawing | Each redraw could get a different answer |
| `react-hooks/exhaustive-deps` | The map's effect relied on a value it didn't list | A classic source of stale data |
| `jsx-a11y/no-noninteractive-tabindex` | A focusable `<span>` used as a tooltip | Keyboard users could reach it but couldn't do anything with it — now a real button |

The pattern behind the fixes is worth learning: **if a value can be calculated from what you already have, calculate it — don't copy it into state and keep it in sync.** See `TelemetryTab.tsx` (`picked ?? defaultSelection`) and `AssetRegistryPage.tsx` (page number tagged with the filters it belongs to).

## 4. Package boundaries, enforced

The architecture says, for example, that `packages/ui` must not know about energy or data. Now ESLint enforces it — try adding `import { Asset } from "@pdm/contracts"` to a file in `packages/ui` and watch the red squiggle: *"Not allowed by the package dependency rules."*

## 5. A tooling decision: TypeScript 7 → 6

TypeScript 7 is a fast new rewrite, but the ESLint TypeScript bridge can't talk to it yet. We moved to TypeScript 6 — see [ADR-0011](../adr/0011-typescript-6-for-tooling.md). Lesson: the newest version isn't always the right one; check that your tools support it.

## 6. Exercises

1. In VS Code, open any `.tsx` file, mess up the indentation of a few lines, and save. What happens?
2. Add `const unused = 1;` inside a component and look at the squiggle. Hover it. Then delete it.
3. Try committing with the message `fixed stuff`. Read commitlint's complaint. Then use `fix(web): correct alarm bar spacing` style instead. (Undo with `git reset --soft HEAD~1` if a commit does go through.)
4. Run `npm run check` and read each section of the output: which tool is speaking?
