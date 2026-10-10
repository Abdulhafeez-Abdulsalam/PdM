# Learning note 01 — The big picture

*Goes with deliverables 1–3. Read this first; the other docs will make more sense afterwards.*

## 1. How a web app works

```
 You type a URL ──▶ Browser downloads HTML + CSS + JavaScript ──▶ JavaScript builds the screen
                                                                     │
                                                                     ▼
                                     JavaScript asks a server for data (an "API request")
                                                                     │
                                                                     ▼
                                      Server replies with data (usually JSON) ──▶ screen updates
```

| Word | Meaning |
|---|---|
| **HTML** | The structure of a page: headings, buttons, lists |
| **CSS** | How it looks: colours, sizes, layout |
| **JavaScript (JS)** | What it does: reacts to clicks, fetches data, changes the page |
| **TypeScript (TS)** | JavaScript plus **types**: you declare the shape of your data, and the editor warns you about mistakes before you run anything |
| **Frontend** | Everything that runs in the browser |
| **Backend** | Server code that stores data and enforces rules |
| **API** | The agreed list of requests the frontend can send to the backend |
| **JSON** | A text format for data: `{ "id": "GT-101", "health": 72 }` |

## 2. Concepts in this project's design

| Concept | One-line explanation | Where it appears |
|---|---|---|
| **Single-page app (SPA)** | The browser loads the app once; moving between pages doesn't reload — JavaScript swaps the content | ADR-0001 |
| **Component** | A reusable piece of UI, like a LEGO brick (`<Button>`, `<KpiCard>`) | Design system |
| **State** | Data that can change while the app runs (selected asset, theme, live values) | Architecture §2 |
| **Router** | Maps URLs to pages | Sitemap |
| **Cache** | A saved copy of data so we don't ask the server twice | Architecture §1 |
| **Mock** | A fake that behaves like the real thing | ADR-0004 |
| **Web Worker** | A background thread so heavy work doesn't freeze the page | ADR-0004 |
| **Contract** | The agreed shape of data both sides follow | `packages/contracts` |
| **Design token** | A named value (colour, spacing) used instead of a raw value | Design system §1 |
| **Monorepo** | Several related packages in one repository | ADR-0002 |
| **ADR** | A short note recording why a decision was made | `docs/adr/` |
| **Accessibility (a11y)** | Making the app usable by everyone, including keyboard-only and screen-reader users | Design system §8 |

## 3. The one idea to remember

> **Separate "what it looks like" from "where the data comes from".**

The screens ask for data through the API client. The API client asks a *transport*. Today the transport talks to a fake backend; tomorrow to a real one. The screens never know the difference. Almost every decision in the architecture protects that separation.

## 4. What to study now (in this order)

You don't need all of this before we start coding — learn alongside the project. Spend most time on 1–3.

1. **HTML & CSS basics** — MDN "Learn web development": https://developer.mozilla.org/en-US/docs/Learn_web_development
2. **JavaScript basics** — variables, functions, arrays, objects, `async/await`: https://javascript.info/
3. **React** — the official tutorial ("Quick Start", then "Thinking in React"): https://react.dev/learn
4. **TypeScript** — "TypeScript for JavaScript Programmers": https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html
5. **Git** — saving versions of your code. You'll need: `git status`, `git add`, `git commit`, `git log`.

## 5. Exercises (no coding yet)

1. Open [the role-to-module matrix](../03-information-architecture/README.md#4-role-to-module-matrix). Pick a role you understand (e.g. Field Technician). Do you agree with what they can see? Write down one change you'd make and why.
2. In [ADR-0006](../adr/0006-chart-point-budget.md), work out the interval and point count for a **3-day** range using the nice-interval list. *(Answer: 3 days = 259,200 s ÷ 2,000 = 129.6 s → next nice interval is 5 min → 864 points.)*
3. In the [design system](../02-design-system/README.md#3-health--severity-scale), why does Control-Room mode show **healthy** equipment in grey? Explain it in one sentence in your own words.
