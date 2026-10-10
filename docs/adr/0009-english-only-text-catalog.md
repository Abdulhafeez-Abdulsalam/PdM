# ADR-0009: English only, but all text in a catalog

- **Status:** Accepted (replaces the spec's six languages including Arabic RTL)
- **Date:** 2026-10-10

## Context
The spec asked for English, Arabic (right-to-left), French, Portuguese, Spanish and Mandarin. The product owner excluded Arabic/RTL. Supporting several languages means translation work and testing every screen in each.

## Decision
- **English only** for now. No right-to-left layout support.
- All visible text still lives in one **text catalog** (`apps/web/src/shared/text/en.json`) and is read through i18next, e.g. `t("alarms.acknowledge")`. No sentences typed directly into components.
- Numbers and dates use the browser's `Intl` API so they format correctly anyway.

## Consequences
- ✅ Much less work and testing.
- ✅ Keeps the spec's "zero hard-coded strings" rule.
- ✅ Adding French, Spanish, etc. later = adding one file per language.
- ❌ Adding Arabic later would also require a layout review (mirroring). Using CSS *logical properties* (`margin-inline-start` instead of `margin-left`) from day one keeps that door open at almost no cost, so we will.
