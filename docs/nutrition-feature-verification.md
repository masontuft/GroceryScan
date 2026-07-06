# Nutrition Feature — Deployment Verification

A step-by-step handoff for verifying the Open Food Facts nutrition/health
feature (migration `20240101000008_products_nutrition.sql`, the
`scan-resolve` enrichment step, and the `NutritionPanel` mobile UI) against a
real deployed Supabase project. Written for an agent/developer running
locally with Docker, the Supabase CLI, and real project credentials — this
can't be exercised from a sandbox with no Docker daemon and no saved
credentials.

## Pass/fail checklist

Fill this in as you go:

- [ ] Step 1 — All 8 nutrition columns + 2 CHECK constraints exist on `products`
- [ ] Step 2 — `scan-resolve` edge function is deployed with the current code
- [ ] Step 3 — Path-independence: DB-resolved product still gets nutrition populated
- [ ] Step 4 — TTL: no refetch on immediate re-call; refetch after backdating past 30 days
- [ ] Step 5 — "Not found in OFF": 200 response with nulls, no repeat refetch
- [ ] Step 6 — `npx tsc --noEmit` clean
- [ ] Step 7 — UI shows verdict/badges/traffic-lights for a known product, and a clean empty state for an unknown one
- [ ] Cleanup done

## Prerequisites

- Docker running locally.
- Supabase CLI installed and authenticated: `supabase login`.
- This repo checked out at (or after) the commit that added the nutrition
  feature, with the project linked: `supabase link --project-ref <your-project-ref>`.
- Two env vars exported in your shell, from the deployed project's API
  settings (Project Settings → API) — **anon/public key only, never the
  service role key or DB password**:
  ```bash
  export SUPABASE_URL="https://<your-project-ref>.supabase.co"
  export SUPABASE_ANON_KEY="<anon key>"
  ```

## Step 1 — Confirm the migration applied

In the Supabase Studio SQL editor (or `psql`), run:

```sql
select column_name from information_schema.columns
where table_name = 'products' and column_name in
('nutriscore_grade','nova_group','nutriments','ingredients_text',
 'allergens_tags','additives_tags','nutrition_source','nutrition_fetched_at');
```

**Pass:** all 8 rows come back. Also confirm the two CHECK constraints exist:

```sql
select conname from pg_constraint
where conname in ('products_nutriscore_grade_check', 'products_nova_group_check');
```

If either check fails, apply the migration: `supabase db push`.

## Step 2 — Confirm the edge function is deployed

```bash
supabase functions deploy scan-resolve
supabase functions list
```

Confirm `scan-resolve` shows a recent deploy timestamp.

## Step 3 — Path-independence test (the core new behavior)

Before this feature, `scan-resolve` only ever called Open Food Facts as a
last-resort *identity* fallback — a product already sitting in your own `products`
table never triggered a nutrition lookup at all. This step proves that gap is closed.

Insert a product directly (bypassing all three identity-resolution paths),
using a real barcode with known Open Food Facts nutrition data — Nutella,
EAN `3017620422003` — and leave `nutrition_fetched_at` null:

```sql
insert into products (name, barcode, ean) values ('Test Nutella', '3017620422003', '3017620422003');
```

Call `scan-resolve`:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/scan-resolve" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"barcode":"3017620422003"}' | jq '.product.nutrition'
```

**Pass:** `nutriScoreGrade`, `novaGroup`, and `nutriments` are non-null —
even though the product resolved via the plain DB-hit path (step 1 of
identity resolution), not the Open Food Facts identity fallback (step 3).

## Step 4 — TTL / no-refetch check

Re-run the exact same curl from Step 3 immediately. **Pass:** `fetchedAt` in
the response is unchanged (no refetch happened).

Now backdate it past the 30-day TTL and re-run:

```sql
update products set nutrition_fetched_at = now() - interval '31 days' where barcode = '3017620422003';
```

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/scan-resolve" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"barcode":"3017620422003"}' | jq '.product.nutrition.fetchedAt'
```

**Pass:** `fetchedAt` is a fresh timestamp (later than the backdated one).

## Step 5 — "Not found in Open Food Facts" check

Insert a product with a barcode guaranteed absent from OFF, so identity
resolves via step 1 but the nutrition lookup legitimately misses:

```sql
insert into products (name, barcode, ean) values ('Test Unknown Nutrition', '9999999999999', '9999999999999');
```

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/scan-resolve" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"barcode":"9999999999999"}' | jq '.product.nutrition'
```

**Pass:** HTTP 200, `nutrition.source` is `null`, all nutrient fields are
`null`, but `nutrition.fetchedAt` is set (proves the "not found" result was
still cached so we don't re-hit OFF on every scan). Re-run the same curl and
confirm `fetchedAt` doesn't change.

## Step 6 — Mobile typecheck

```bash
cd mobile && npx tsc --noEmit
```

**Pass:** no errors (already verified clean in the implementing session;
this just confirms nothing regressed after pulling).

## Step 7 — UI walkthrough

```bash
cd mobile && npm run ios   # or npm run android
```

Scan or manually enter barcode `3017620422003`. On `ProductDetailScreen`,
confirm the **Nutrition** section shows: a colored verdict banner, Nutri-Score
and NOVA badges, traffic-light rows for sugars/salt/saturated fat/fat with
correct colors, and expandable ingredients text.

Then scan/enter barcode `9999999999999` and confirm it shows the "Nutrition
information not available for this product" empty state cleanly, with no
broken layout.

## Cleanup

Remove the two test rows once verification is done:

```sql
delete from products where barcode in ('3017620422003', '9999999999999');
```
