// One-time (and periodic, e.g. quarterly) import of SerpApi's static Walmart
// store list into `walmart_store_reference`, geocoded once via the free US
// Census Bureau batch geocoder. Deliberately lives outside supabase/functions/
// so it's never deployed or web-reachable — this is an ops script, not a
// runtime dependency. resolve-nearby-store never calls SerpApi or the Census
// API; it only ever reads the table this script populates.
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno run --allow-net --allow-env supabase/scripts/import-walmart-store-reference.ts
//
// Optionally set SERPAPI_KEY if the unauthenticated fetch of
// walmart-stores.json gets rejected (the script tries without a key first
// and logs which path worked).
//
// Confirmed live schema (fetched and inspected directly): a flat JSON array,
// each entry `{ store_id, postal_code, address }` only — no country/city/
// state fields, and `address` is inconsistently formatted (some rows are
// "street, City, ST zip", some are just a bare street). There's no field to
// filter US vs. the ~121 Mexico entries by, so we don't try — the Census
// batch geocoder only knows US addresses, so Mexico rows simply fail to
// geocode, end up with lat/lng NULL, and are excluded from
// find_nearest_walmart_store's results for free.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY') ?? '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  Deno.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface RawStore {
  store_id?: string | number;
  id?: string | number;
  postal_code?: string;
  zip?: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
}

interface ReferenceRow {
  store_id: string;
  country: string;
  postal_code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
}

async function fetchWalmartStores(): Promise<RawStore[]> {
  const url = 'https://serpapi.com/walmart-stores.json';
  let res = await fetch(url);
  let authenticated = false;
  if (!res.ok && SERPAPI_KEY) {
    console.log(`[import] unauthenticated fetch got ${res.status}, retrying with api_key`);
    res = await fetch(`${url}?api_key=${SERPAPI_KEY}`);
    authenticated = true;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch walmart-stores.json: ${res.status} ${await res.text()}`);
  }
  console.log(`[import] fetched walmart-stores.json (${authenticated ? 'authenticated' : 'unauthenticated'})`);

  const json = await res.json();
  const stores: RawStore[] = Array.isArray(json)
    ? json
    : (json.stores ?? json.walmart_stores ?? json.data ?? []);

  if (stores.length === 0) {
    console.log('[import] raw response shape (first 500 chars):', JSON.stringify(json).slice(0, 500));
    throw new Error('Could not find a store list array in the response — inspect the shape above and fix the lookup.');
  }
  console.log('[import] example raw entry:', JSON.stringify(stores[0]));
  return stores;
}

function storeId(s: RawStore): string {
  return String(s.store_id ?? s.id ?? '');
}

// SerpApi's address field may be a single combined string
// ("14 Bowen St, Claremont, NH 03743") rather than separate city/state
// fields. Parse both shapes so downstream geocoding + the reference table
// get city/state populated either way.
function splitAddress(s: RawStore): { street: string; city: string; state: string } {
  if (s.city && s.state) {
    return { street: s.street ?? s.address ?? '', city: s.city, state: s.state };
  }
  const full = s.address ?? s.street ?? '';
  const match = full.match(/^(.*),\s*([^,]+),\s*([A-Z]{2})\s*\d{5}(-\d{4})?$/);
  if (match) {
    return { street: match[1].trim(), city: match[2].trim(), state: match[3].trim() };
  }
  return { street: full, city: s.city ?? '', state: s.state ?? '' };
}

function csvEscape(value: string): string {
  const v = value.replace(/"/g, '""');
  return /[",\n]/.test(v) ? `"${v}"` : v;
}

// Minimal CSV line parser handling quoted fields (Census output quotes the
// matched address, which itself contains commas).
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { fields.push(cur); cur = ''; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

// Census Bureau free batch geocoder: no API key, up to 10,000 addresses per
// CSV upload. https://geocoding.geo.census.gov/geocoder/locations/addressbatch
async function geocodeBatch(rows: RawStore[]): Promise<Map<string, [number, number]>> {
  const results = new Map<string, [number, number]>();
  const BATCH_SIZE = 10000; // Census max per request; we're well under this at ~4,600 US rows

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const csvLines = chunk.map((s) => {
      const id = storeId(s);
      const { street, city, state } = splitAddress(s);
      const zip = s.postal_code ?? s.zip ?? '';
      return [id, street, city, state, zip].map(csvEscape).join(',');
    });
    const csv = csvLines.join('\n');

    const form = new FormData();
    form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addresses.csv');
    form.append('benchmark', 'Public_AR_Current');

    console.log(`[import] geocoding batch of ${chunk.length} addresses via Census Bureau (this can take a few minutes)...`);
    const res = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      console.error(`[import] Census geocoder batch failed: ${res.status} — this batch's lat/lng will stay NULL`);
      continue;
    }
    const text = await res.text();
    let matched = 0;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const fields = parseCsvLine(line);
      // Columns: Unique ID, Input Address, Match Status, Match Type, Matched Address, Coordinates, Tiger Line ID, Side
      const [id, , matchStatus, , , coords] = fields;
      if (matchStatus !== 'Match' || !coords) continue;
      const [lngStr, latStr] = coords.split(',');
      const lng = Number(lngStr);
      const lat = Number(latStr);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        results.set(id, [lat, lng]);
        matched++;
      }
    }
    console.log(`[import] geocoded ${matched}/${chunk.length} in this batch`);
  }

  return results;
}

async function upsertReferenceRows(rows: ReferenceRow[]) {
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await db.from('walmart_store_reference').upsert(chunk, { onConflict: 'store_id' });
    if (error) {
      console.error(`[import] upsert failed for rows ${i}-${i + chunk.length}:`, error.message);
      continue;
    }
    upserted += chunk.length;
    console.log(`[import] upserted ${upserted}/${rows.length}`);
  }
}

async function main() {
  const raw = await fetchWalmartStores();
  console.log(`[import] ${raw.length} total store rows found (US + a small number of Mexico rows that will fail to geocode and end up excluded)`);

  const geocoded = await geocodeBatch(raw);
  console.log(`[import] geocoded ${geocoded.size}/${raw.length} addresses total`);

  const rows: ReferenceRow[] = raw.map((s) => {
    const id = storeId(s);
    const { street, city, state } = splitAddress(s);
    const coords = geocoded.get(id);
    return {
      store_id: id,
      country: 'US',
      postal_code: s.postal_code ?? s.zip ?? null,
      address: street || s.address || null,
      city: city || null,
      state: state || null,
      lat: coords?.[0] ?? null,
      lng: coords?.[1] ?? null,
    };
  }).filter((r) => r.store_id);

  // The raw feed has a handful of duplicate store_ids. A single multi-row
  // upsert can't reference the same conflict key (store_id) twice — Postgres
  // rejects that with "ON CONFLICT DO UPDATE command cannot affect row a
  // second time" — so collapse duplicates before chunking (last one wins).
  const deduped = [...new Map(rows.map((r) => [r.store_id, r])).values()];
  if (deduped.length !== rows.length) {
    console.log(`[import] collapsed ${rows.length - deduped.length} duplicate store_id rows`);
  }

  await upsertReferenceRows(deduped);
  console.log('[import] done.');
}

main().catch((err) => {
  console.error('[import] fatal error:', err);
  Deno.exit(1);
});
