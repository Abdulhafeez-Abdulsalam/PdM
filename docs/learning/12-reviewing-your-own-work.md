# Learning note 12: Reviewing your own work

*This note goes with the [Phase 2 review](../phase-2-review.md).*

## 1. A review isn't a summary

A summary says what you built. A review checks it against something: the plan, the acceptance criteria, the standards. Three questions do most of the work:

1. **What did we promise?** Here that means the information architecture's Phase 2 list and the acceptance criteria A–G.
2. **What's the evidence for each?** A test, a measurement, a screenshot. "I think it works" is not evidence.
3. **What did we not do?** Write it down. A gap you've listed is a decision; one you haven't listed is a surprise later.

## 2. Accessibility checking with axe

[axe-core](https://github.com/dequelabs/axe-core) is the standard automatic accessibility checker; browsers' own tools use it. We already had it installed (the ESLint accessibility plugin depends on it). The review loaded it into the running app and ran it on every Phase 2 screen in each theme.

What it found:
- **Colour contrast:** text must be at least 4.5 times "brighter" than its background (WCAG AA). The control-room red was 3.0.
- **Label in name:** if a link *shows* "P1 0", its accessible name must contain "P1 0". People using voice control say what they see ("click P1 0").
- **Roles:** a list (`<ol>`) can't also be a `status` region; wrap it instead.

axe catches maybe a third of accessibility problems. The rest (keyboard order, meaningful labels, whether something makes sense when read aloud) still need a person.

## 3. Check at the source

axe only checks what's on screen. No scanned page happened to show an "offline" asset in the control-room theme, so axe couldn't see that its grey text was unreadable. Checking the **colour tokens themselves** found eight more problems.

That became a test, [tokens.test.ts](../../packages/ui/src/tokens.test.ts). It reads `tokens.css`, calculates the contrast of every text colour on every background, and fails if any is under 4.5. Before the fix it failed on exactly the nine colours the audit found. That's how you know a new test actually works: **watch it fail first.**

## 4. Small mysteries are worth chasing

Turbo reported 31 mock-data tests while Vitest reported 32. That turned out to be harmless: a debugging file is excluded on purpose. But a test file that silently stops running is a real and common failure, and you only find it by noticing numbers that don't match.

## 5. Exercises

1. Open the app in the **Control room** theme and find a red error message (Field → a job in progress → press "Complete job" with nothing filled in). Compare it with the colour before this review: `#e5484d`.
2. In `packages/ui/src/tokens.css`, change `--pdm-health-offline` in the light theme to `#9ca3af`, then run `npm test --workspace @pdm/ui`. What fails, and why? Undo the change.
3. Pick one item from "Planned for Phase 2 but not built" in the review. Write three acceptance criteria for it the way A–G are written.
