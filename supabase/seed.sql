-- Seed: sample stores
INSERT INTO stores (id, chain, name, region, location_id, active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'kroger', 'Kroger - Main St', 'TX', '01400943', true),
  ('00000000-0000-0000-0000-000000000002', 'kroger', 'King Soopers - Denver', 'CO', '70300132', true),
  ('00000000-0000-0000-0000-000000000003', 'instacart', 'Safeway (via Instacart)', 'CA', 'safeway', true),
  ('00000000-0000-0000-0000-000000000004', 'instacart', 'Albertsons (via Instacart)', 'AZ', 'albertsons', true)
ON CONFLICT DO NOTHING;

-- Seed: sample product for testing
INSERT INTO products (id, name, brand, upc, barcode, size, unit, categories) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Organic Whole Milk', 'Horizon', '742365004017', '742365004017', '1', 'gallon', ARRAY['dairy', 'milk'])
ON CONFLICT DO NOTHING;

-- Seed: sample promotion
INSERT INTO promotions (store_id, product_id, type, description, discount_value, start_date, end_date, version) VALUES
  ('00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'markdown', 'Member Price: $0.50 off', 0.50,
   now() - interval '1 day', now() + interval '30 days', 1)
ON CONFLICT DO NOTHING;
