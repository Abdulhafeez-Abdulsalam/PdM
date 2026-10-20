# ADR-0011: TypeScript 6 (not 7) so linting works

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
The project started on TypeScript 7.0, the new native rewrite of the compiler (much faster type-checking).

When adding ESLint, we found that **typescript-eslint** — the bridge that lets ESLint understand TypeScript — needs TypeScript's JavaScript API (`createSourceFile`, `createProgram`, …). TypeScript 7 doesn't provide that API yet. typescript-eslint officially supports TypeScript `>=4.8.4 <6.1.0`.

## Options considered
1. **Stay on TypeScript 7, skip ESLint** — loses bug-finding rules, React Hooks rules, accessibility rules and package-boundary checks.
2. **Install TypeScript 6 and 7 side by side** and force typescript-eslint onto 6 via npm overrides — fragile; two compilers that can disagree.
3. **Replace ESLint with a TypeScript-7-native linter** — the spec names ESLint, and the React Hooks and jsx-a11y rule sets we want are ESLint plugins.
4. **Move to TypeScript 6.0.3** — the last release of the classic compiler, fully supported by typescript-eslint. Our code compiles unchanged.

## Decision
Option 4: TypeScript `~6.0.3` (the `~` allows bug-fix updates only).

## Consequences
- ✅ ESLint with typed TypeScript rules, React Hooks rules, accessibility rules and package boundaries.
- ✅ No code changes were needed.
- ❌ Type-checking is slower than TypeScript 7 — not noticeable at our size.
- Revisit when typescript-eslint supports TypeScript 7 (track its release notes); switching back should be a version bump.
