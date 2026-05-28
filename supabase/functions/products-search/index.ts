import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  const storeId = url.searchParams.get('storeId');

  if (!q?.trim()) return errorResponse('q parameter is required');

  const db = getAdminClient();

  const { data, error } = await db
    .from('products')
    .select('*')
    .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
    .limit(20);

  if (error) return errorResponse(error.message, 500);

  const products = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    upc: row.upc,
    ean: row.ean,
    gtin: row.gtin,
    sku: row.sku,
    size: row.size,
    unit: row.unit,
    imageUrl: row.image_url,
    categories: row.categories,
  }));

  return jsonResponse({ products, storeId });
});
