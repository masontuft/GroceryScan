ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_products"   ON products      FOR SELECT USING (true);
CREATE POLICY "public_read_stores"     ON stores        FOR SELECT USING (true);
CREATE POLICY "public_read_pricing"    ON store_pricing FOR SELECT USING (true);
CREATE POLICY "public_read_promotions" ON promotions    FOR SELECT USING (true);
