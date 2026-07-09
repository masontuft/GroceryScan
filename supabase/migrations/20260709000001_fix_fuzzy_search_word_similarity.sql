-- search_products_fuzzy previously used similarity(), which scores against the whole
-- stored string. A short query like "milk" scores ~0.10-0.15 against a long product
-- name like "Great Value 2% Reduced Fat Milk, 1 Gallon" — well under the 0.3 default
-- threshold — so it returned 0 rows for products that actually match. word_similarity()
-- scores the query against the best-matching substring instead, and a plain ILIKE
-- catches exact substring matches regardless of trigram scoring. (If the products
-- table grows large enough for this to need an index, pg_trgm's `<%` operator form
-- can use the existing gin_trgm_ops indexes; not worth the added complexity yet.)
CREATE OR REPLACE FUNCTION search_products_fuzzy(query text, threshold float DEFAULT 0.3)
RETURNS SETOF products LANGUAGE sql STABLE AS $$
  SELECT * FROM products
  WHERE name ILIKE '%' || query || '%'
     OR coalesce(brand, '') ILIKE '%' || query || '%'
     OR word_similarity(query, name) > threshold
     OR word_similarity(query, coalesce(brand, '')) > threshold
  ORDER BY GREATEST(
    word_similarity(query, name),
    word_similarity(query, coalesce(brand, ''))
  ) DESC
  LIMIT 10;
$$;
