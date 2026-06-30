-- Enable trigram similarity for fuzzy product name search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON products USING gin(brand gin_trgm_ops);

-- RPC used by products-search and scan-resolve fallback
CREATE OR REPLACE FUNCTION search_products_fuzzy(query text, threshold float DEFAULT 0.3)
RETURNS SETOF products LANGUAGE sql STABLE AS $$
  SELECT * FROM products
  WHERE similarity(name, query) > threshold
     OR similarity(coalesce(brand, ''), query) > threshold
  ORDER BY GREATEST(similarity(name, query), similarity(coalesce(brand, ''), query)) DESC
  LIMIT 10;
$$;

-- GS1 manufacturer prefix for brand clustering (first 7 digits of UPC/barcode)
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer_prefix TEXT;
CREATE INDEX IF NOT EXISTS idx_products_manufacturer_prefix ON products(manufacturer_prefix);

-- Backfill existing rows
UPDATE products
SET manufacturer_prefix = LEFT(COALESCE(upc, barcode, gtin, ean), 7)
WHERE manufacturer_prefix IS NULL
  AND (upc IS NOT NULL OR barcode IS NOT NULL OR gtin IS NOT NULL OR ean IS NOT NULL);
