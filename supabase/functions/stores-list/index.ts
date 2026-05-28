import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const db = getAdminClient();
  const { data, error } = await db.from('stores').select('*').eq('active', true).order('name');

  if (error) return errorResponse(error.message, 500);

  const stores = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    chain: row.chain,
    name: row.name,
    region: row.region,
    locationId: row.location_id,
  }));

  return jsonResponse({ stores });
});
