-- Post-checkout receipt comparison: a user photographs their printed receipt,
-- receipt-compare parses it (Gemini vision) and matches lines against the
-- basket that was in the cart at scan time, so systematic pricing/tax/promo
-- errors can be found later (e.g. GROUP BY price_source on receipt_scan_items).
CREATE TABLE receipt_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id),
  basket_snapshot jsonb NOT NULL,        -- BasketItem[] at scan time
  calculated_subtotal numeric NOT NULL,
  calculated_tax numeric NOT NULL,
  calculated_total numeric NOT NULL,
  actual_subtotal numeric,
  actual_tax numeric,
  actual_total numeric,
  total_delta numeric,
  ocr_raw_text text,
  ocr_confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE receipt_scan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_scan_id uuid NOT NULL REFERENCES receipt_scans(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  receipt_line_raw_text text,
  receipt_line_price numeric,
  calculated_price numeric,
  price_delta numeric,
  price_source text,                     -- copied from BasketItem.priceSource
  match_confidence numeric,
  match_method text CHECK (match_method IN ('fuzzy_auto', 'manual_confirm', 'unmatched'))
);

CREATE INDEX idx_receipt_scan_items_scan_id ON receipt_scan_items(receipt_scan_id);
CREATE INDEX idx_receipt_scan_items_price_source ON receipt_scan_items(price_source);

-- No public SELECT/INSERT/UPDATE policies (unlike products/stores/store_pricing/
-- promotions in 20240101000005_rls.sql, which are public read data). Receipt
-- scans carry a full basket snapshot and OCR'd receipt text tied to a single
-- shopping trip — only the service-role admin client (which bypasses RLS, see
-- _shared/supabaseAdmin.ts) should read or write these tables.
ALTER TABLE receipt_scans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_scan_items ENABLE ROW LEVEL SECURITY;
