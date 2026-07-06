# Dev Log — Open Food Facts Nutrition/Health Analysis
**Date:** 2026-07-06

---

## What We Built

Every scanned product now gets a health/nutrition read-out on `ProductDetailScreen`,
sourced from Open Food Facts (OFF) and boiled down into a single app-generated
verdict, not just raw numbers.

---

## Background

GroceryScan already talked to OFF, but only as a last-resort *identity*
fallback in `scan-resolve/index.ts` — triggered only when a barcode wasn't in
our own `products` table **and** upcitemdb also missed — and even then it
only pulled name/brand/image/quantity/categories. Nutrition fields were never
requested. That meant most scans of already-known products never touched OFF
at all, so there was no path to nutrition data for the common case.

This sprint decoupled "nutrition enrichment" from "identity resolution"
entirely: nutrition is now fetched and cached on every product regardless of
which of the three identity paths (own DB / upcitemdb / OFF fallback) found it.

---

## Backend: `scan-resolve` nutrition enrichment

**New file:** `supabase/functions/_shared/offNutrition.ts`

Plain async function `fetchOffNutrition(variants)` — deliberately not a
`PricingProvider`-style class/registry, since there's exactly one nutrition
source today. Calls OFF's `?fields=` param
(`nutriscore_grade,nova_group,nutriments,ingredients_text,allergens_tags,additives_tags`)
to keep the response lean, and maps OFF's raw nutriment keys
(`sugars_100g`, `saturated-fat_100g`, etc.) into a clean camelCase shape
(`sugarsPer100g`, `saturatedFatPer100g`, ...) so the DB column and the mobile
type need zero re-mapping downstream.

**`scan-resolve/index.ts` change:** after product identity is resolved (right
after the 404 guard, before pricing-provider fan-out), a new step checks
`product.nutrition_fetched_at` against a 30-day TTL. If stale/missing, it
calls `fetchOffNutrition`, `UPDATE`s the `products` row by `id` (not the
select-then-insert dance used for `upc`-keyed inserts — that only exists to
work around the partial unique index blocking `ON CONFLICT`, which doesn't
apply to updating an already-resolved row), and reassigns `product` to the
updated row. Wrapped in try/catch that only logs — a nutrition-fetch failure
must never block or break the scan response, same best-effort tone as the
pricing fan-out. `nutrition_fetched_at` is set even on an OFF "not found"
result, so a product OFF simply doesn't have isn't re-queried on every scan.

**New migration:** `supabase/migrations/20240101000008_products_nutrition.sql`
adds `nutriscore_grade`, `nova_group`, `nutriments` (jsonb), `ingredients_text`,
`allergens_tags`, `additives_tags`, `nutrition_source`, `nutrition_fetched_at`
to `products`, with CHECK constraints on the grade/group enums. No RLS change
needed — the existing public-read policy has no column allowlist.

---

## Health verdict: a documented rubric, not a black box

**New doc:** `docs/health-verdict-rubric.md` — the source of truth for how
Nutri-Score + NOVA group + per-100g traffic-light nutrients combine into one
verdict. Point-based and fully transparent:

- Nutri-Score: a=0 → e=4 points (unknown=2, neutral)
- NOVA group: 1-2=0, 3=1, 4=3 points (unknown=1)
- Traffic lights: +1 for each of sugars/salt/saturated fat/fat rated "high"
  per standard UK FSA thresholds (0-4 points)
- Total (0-11) maps to a 4-tier verdict: **Great choice** (0-2) → **Good**
  (3-5) → **Consume in moderation** (6-8) → **Limit intake** (9-11)
- No data at all → **"Not enough data"**, never a fabricated tier

**New file:** `mobile/src/utils/healthVerdict.ts` implements the doc exactly,
with comments pointing back to it — future threshold tuning happens in the
doc first, then the constants get mirrored.

---

## Mobile: types, utils, UI

- `mobile/src/types/nutrition.ts` — `NutriScoreGrade`, `NovaGroup`,
  `Nutriments`, `NutritionInfo`.
- `mobile/src/types/product.ts` — `Product.nutrition: NutritionInfo | null`.
  Nutrition only ever arrives via `scan-resolve`; the 3 other places that
  manually construct `Product` objects (`api.ts` × 2, `ProductDetailScreen`'s
  "more from this brand" query) now set `nutrition: null` explicitly — an
  intentional scope boundary, not a gap.
- `mobile/src/utils/nutritionScore.ts` — mirrors the existing `freshness.ts`
  pattern (label fn + paired color fn): Nutri-Score colors (OFF's own A-E
  palette), NOVA group label/color, and `nutrientLevel()` traffic-light
  classification using the FSA thresholds.
- `mobile/src/components/NutritionPanel.tsx` — new section on
  `ProductDetailScreen`, styled to match its existing section conventions.
  Shows the verdict banner, Nutri-Score/NOVA badges, traffic-light rows,
  plain energy/fiber/protein stats, allergen chips, and collapsible
  ingredients text (+ additives caption). Renders a clean "not available"
  empty state when OFF has nothing for the product.

---

## Verification

- `cd mobile && npx tsc --noEmit` — clean, confirms all `Product`-construction
  sites compile with the new required field.
- Manually walked the rubric math by hand against a few real Nutri-Score/NOVA/
  nutriment combinations to sanity-check the tier boundaries before wiring up
  the UI.
- Not yet run against a live Supabase project — `supabase db push` still
  needs to be run against the target project/environment before this ships,
  per the usual migration workflow in `CLAUDE.md`.
