CREATE TABLE store_pricing (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid REFERENCES stores(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES products(id) ON DELETE CASCADE,
  regular_price    numeric(10,2),
  sale_price       numeric(10,2),
  effective_start  timestamptz,
  effective_end    timestamptz,
  source_timestamp timestamptz DEFAULT now(),
  confidence_score numeric(3,2) DEFAULT 1.0,
  source           text NOT NULL,
  UNIQUE (store_id, product_id, source)
);

CREATE INDEX store_pricing_product_idx ON store_pricing(product_id);
CREATE INDEX store_pricing_store_idx   ON store_pricing(store_id);
