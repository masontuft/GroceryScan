-- Open Food Facts nutrition/health enrichment columns for products.
-- Populated best-effort by scan-resolve after product identity is resolved,
-- independent of which of the 3 identity paths (own DB / upcitemdb / OFF
-- identity fallback) found the product — see NUTRITION_TTL_MS in
-- supabase/functions/scan-resolve/index.ts.
ALTER TABLE products
  ADD COLUMN nutriscore_grade     text,
  ADD COLUMN nova_group           smallint,
  ADD COLUMN nutriments           jsonb,
  ADD COLUMN ingredients_text     text,
  ADD COLUMN allergens_tags       text[] DEFAULT '{}',
  ADD COLUMN additives_tags       text[] DEFAULT '{}',
  ADD COLUMN nutrition_source     text,
  ADD COLUMN nutrition_fetched_at timestamptz;

ALTER TABLE products
  ADD CONSTRAINT products_nutriscore_grade_check
    CHECK (nutriscore_grade IS NULL OR nutriscore_grade IN ('a', 'b', 'c', 'd', 'e'));

ALTER TABLE products
  ADD CONSTRAINT products_nova_group_check
    CHECK (nova_group IS NULL OR nova_group BETWEEN 1 AND 4);

COMMENT ON COLUMN products.nutriments IS
  'camelCase per-100g nutriment values from Open Food Facts, pre-shaped for
   pass-through into the API response with zero re-mapping: energyKcalPer100g,
   sugarsPer100g, saltPer100g, saturatedFatPer100g, fatPer100g, fiberPer100g,
   proteinsPer100g. All nullable.';

COMMENT ON COLUMN products.nutrition_fetched_at IS
  'Set on every OFF nutrition lookup attempt, including "not found" results, so
   scan-resolve does not re-hit OFF on every scan of a product OFF lacks data
   for.';
