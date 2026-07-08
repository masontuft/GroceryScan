-- Static reference data imported once (and periodically re-run) from
-- SerpApi's walmart-stores.json + a one-time Census Bureau geocoding pass.
-- See supabase/scripts/import-walmart-store-reference.ts. Never queried
-- against a live third-party API at request time — pure local lookup table,
-- so "nearest store" resolution has zero runtime dependency on SerpApi.
CREATE TABLE walmart_store_reference (
  store_id     text PRIMARY KEY,        -- Walmart's numeric store id, e.g. "1975" (as text)
  country      text NOT NULL DEFAULT 'US',
  postal_code  text,
  address      text,
  city         text,
  state        text,
  lat          double precision,        -- NULL until the geocoding pass succeeds for this row
  lng          double precision,
  imported_at  timestamptz DEFAULT now()
);

CREATE INDEX walmart_store_reference_postal_code_idx ON walmart_store_reference(postal_code);
CREATE INDEX walmart_store_reference_state_city_idx ON walmart_store_reference(state, city);
CREATE INDEX walmart_store_reference_geo_idx ON walmart_store_reference(lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

ALTER TABLE walmart_store_reference ENABLE ROW LEVEL SECURITY;
-- Deliberately zero policies: only the service-role admin client used inside
-- edge functions (getAdminClient()) can read this table, same as every other
-- admin-only lookup in this codebase. It's internal reference data, not
-- user-facing — default-deny is correct here, not an oversight.

-- Pre-existing seed data has duplicate (chain, location_id) pairs (the old
-- Costco/WinCo demo rows shared one placeholder location_id per chain, and
-- the old Walmart demo rows shared 'walmart') — the ALTER TABLE below would
-- fail against that data. De-dupe any such collisions in place first so this
-- migration is safe to run against an already-seeded local/dev DB (seed.sql
-- itself has separately been fixed to not reintroduce this on a fresh seed).
UPDATE stores s
SET location_id = location_id || '-' || substr(id::text, 1, 8)
WHERE (chain, location_id) IN (
  SELECT chain, location_id FROM stores
  WHERE location_id IS NOT NULL
  GROUP BY chain, location_id HAVING count(*) > 1
);

-- Makes resolve-nearby-store's upsert idempotent: many users resolving to
-- the same physical Walmart store must map to one `stores` row, not one per
-- request. Postgres treats each NULL as distinct for uniqueness purposes, so
-- the single generic "Walmart" placeholder row (location_id = NULL, added in
-- seed.sql) never collides with this constraint — only concrete resolved
-- stores (non-null location_id) are deduplicated by it.
ALTER TABLE stores ADD CONSTRAINT stores_chain_location_id_key UNIQUE (chain, location_id);

-- Single-query nearest-store lookup used by resolve-nearby-store. Clamps
-- acos()'s argument to [-1, 1] — floating-point rounding can otherwise push
-- it slightly outside that domain and make acos() return NaN, a real crash
-- risk (not theoretical) for haversine formulas at small distances.
-- No hard distance cutoff: for genuinely rural users, the true nearest
-- Walmart may be 100+ miles away, and that's still the correct answer.
CREATE OR REPLACE FUNCTION find_nearest_walmart_store(
  in_lat double precision,
  in_lng double precision
)
RETURNS TABLE (
  store_id text, address text, city text, state text, postal_code text, distance_km double precision
)
LANGUAGE sql STABLE AS $$
  SELECT store_id, address, city, state, postal_code, d.distance_km
  FROM walmart_store_reference,
    LATERAL (
      SELECT 6371 * acos(least(1.0, greatest(-1.0,
        cos(radians(in_lat)) * cos(radians(lat)) * cos(radians(lng) - radians(in_lng)) +
        sin(radians(in_lat)) * sin(radians(lat))
      ))) AS distance_km
    ) d
  WHERE lat IS NOT NULL AND lng IS NOT NULL
  ORDER BY d.distance_km ASC
  LIMIT 1
$$;
