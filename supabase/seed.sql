-- Seed: sample stores
INSERT INTO stores (id, chain, name, region, location_id, active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'kroger', 'Kroger - Main St', 'TX', '01400943', true),
  ('00000000-0000-0000-0000-000000000002', 'kroger', 'King Soopers - Denver', 'CO', '70300132', true),
  ('00000000-0000-0000-0000-000000000003', 'instacart', 'Safeway (via Instacart)', 'CA', 'safeway', true),
  ('00000000-0000-0000-0000-000000000004', 'instacart', 'Albertsons (via Instacart)', 'AZ', 'albertsons', true),
  -- Generic placeholder: shown in StoreSelectScreen like any other chain,
  -- but tapping it resolves+selects the user's actual nearest Walmart via
  -- resolve-nearby-store (location_id stays NULL — real resolved stores
  -- always get a non-null location_id, which is how the client tells them
  -- apart). location_id NULL never collides with the UNIQUE(chain,
  -- location_id) constraint added in 20240101000009.
  ('00000000-0000-0000-0000-000000000005', 'walmart', 'Walmart', NULL, NULL, true),
  -- location_id given a per-row suffix (rather than the shared chain-level
  -- placeholder these used before) so these don't collide under the new
  -- UNIQUE(chain, location_id) constraint added in 20240101000009.
  ('00000000-0000-0000-0000-000000000007', 'costco', 'Costco Wholesale - Seattle', 'WA', 'costco-seattle', true),
  ('00000000-0000-0000-0000-000000000008', 'costco', 'Costco Wholesale - Portland', 'OR', 'costco-portland', true),
  ('00000000-0000-0000-0000-000000000009', 'winco', 'WinCo Foods - Boise', 'ID', 'winco_foods-boise', true),
  ('00000000-0000-0000-0000-000000000010', 'winco', 'WinCo Foods - Sacramento', 'CA', 'winco_foods-sacramento', true)
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
