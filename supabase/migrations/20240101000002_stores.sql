CREATE TABLE stores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain       text NOT NULL,
  name        text NOT NULL,
  region      text,
  location_id text,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX stores_chain_idx ON stores(chain);
