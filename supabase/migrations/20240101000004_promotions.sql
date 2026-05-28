CREATE TABLE promotions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid REFERENCES stores(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES products(id) ON DELETE CASCADE,
  type              text NOT NULL CHECK (type IN ('bogo', 'markdown', 'digital_coupon', 'member')),
  description       text,
  discount_value    numeric(10,2),
  eligibility_rules jsonb,
  start_date        timestamptz,
  end_date          timestamptz,
  version           int DEFAULT 1,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX promotions_product_store_idx ON promotions(product_id, store_id);
CREATE INDEX promotions_date_idx ON promotions(start_date, end_date);
