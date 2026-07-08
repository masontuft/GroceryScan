import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

/**
 * resolve-nearby-store — resolves a device lat/lng to the nearest real store
 * for a given chain, and upserts it into `stores` so it shows up in the
 * mobile app's store picker.
 *
 * Currently only `chain: 'walmart'` is supported. Lookup is a pure local DB
 * query against `walmart_store_reference` (a one-time-imported static list,
 * see supabase/scripts/import-walmart-store-reference.ts) — this function
 * never calls any third-party API at request time, so it can't be
 * rate-limited or run up API cost as usage grows.
 *
 * Body: { chain: string; lat: number; lng: number }
 * Returns: { store: { id, chain, name, region, locationId } | null }
 * Always 200 — "no match" is a normal, expected outcome, not an error.
 */

const SUPPORTED_CHAINS = ['walmart'];
const REQUEST_TIMEOUT_MS = 5000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const timeout = new Promise<Response>((resolve) =>
      setTimeout(() => resolve(jsonResponse({ store: null })), REQUEST_TIMEOUT_MS)
    );
    return await Promise.race([handleRequest(req), timeout]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[resolve-nearby-store] unhandled error:', message);
    return errorResponse(`Internal error: ${message}`, 500);
  }
});

async function handleRequest(req: Request) {
  let body: { chain?: string; lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { chain, lat, lng } = body;

  if (!chain || !SUPPORTED_CHAINS.includes(chain)) {
    return jsonResponse({ store: null });
  }
  if (
    typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    return jsonResponse({ store: null });
  }

  const db = getAdminClient();

  const { data: matches, error: rpcErr } = await db.rpc('find_nearest_walmart_store', {
    in_lat: lat,
    in_lng: lng,
  });

  if (rpcErr) {
    console.error('[resolve-nearby-store] find_nearest_walmart_store failed:', rpcErr.message);
    return jsonResponse({ store: null });
  }

  const match = matches?.[0] as
    | { store_id: string; address: string; city: string; state: string; postal_code: string; distance_km: number }
    | undefined;

  if (!match) return jsonResponse({ store: null });

  const name = match.city && match.state
    ? `Walmart Supercenter - ${match.city}, ${match.state}`
    : 'Walmart Supercenter';

  const { data: store, error: upsertErr } = await db
    .from('stores')
    .upsert(
      { chain: 'walmart', name, region: match.state ?? null, location_id: match.store_id, active: true },
      { onConflict: 'chain,location_id' }
    )
    .select('id, chain, name, region, location_id')
    .single();

  if (upsertErr || !store) {
    console.error('[resolve-nearby-store] upsert failed:', upsertErr?.message);
    return jsonResponse({ store: null });
  }

  return jsonResponse({
    store: {
      id: store.id,
      chain: store.chain,
      name: store.name,
      region: store.region,
      locationId: store.location_id,
    },
  });
}
