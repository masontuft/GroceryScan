-- The partial unique index on products.upc (WHERE upc IS NOT NULL) cannot be used
-- as an `ON CONFLICT (upc)` target, so scan-resolve's UPCitemdb/OFF product upserts
-- fail with Postgres error 42P10 ("no unique or exclusion constraint matching the
-- ON CONFLICT specification"). The error was silently swallowed, leaving the product
-- unsaved and the scan returning 404 even when product data was found upstream.
--
-- Replace the partial unique index with a real UNIQUE constraint. Postgres treats
-- NULLs as distinct in a UNIQUE constraint, so multiple rows with a NULL upc are
-- still allowed — identical effective behavior to the partial index — but the
-- constraint can now serve as an ON CONFLICT target.
DROP INDEX IF EXISTS products_upc_idx;
ALTER TABLE products ADD CONSTRAINT products_upc_key UNIQUE (upc);
