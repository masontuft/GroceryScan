CREATE TABLE products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  brand       text,
  barcode     text,
  upc         text,
  ean         text,
  gtin        text,
  sku         text,
  size        text,
  unit        text,
  image_url   text,
  categories  text[] DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX products_upc_idx     ON products(upc)     WHERE upc IS NOT NULL;
CREATE UNIQUE INDEX products_ean_idx     ON products(ean)     WHERE ean IS NOT NULL;
CREATE UNIQUE INDEX products_barcode_idx ON products(barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX products_gtin_idx    ON products(gtin)    WHERE gtin IS NOT NULL;
