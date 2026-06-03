import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

/**
 * manual-submit — persists user-entered product data and pricing to Supabase.
 *
 * Called from ManualPriceScreen when the user manually enters a price for an
 * item whose barcode was not found in the database or any pricing provider.
 *
 * Body:
 *   barcode         — raw scanned barcode (used as upc)
 *   productName     — user-provided item name
 *   price           — user-entered shelf price
 *   storeId?        — UUID of an existing store (if the user picked one)
 *   customStoreName?— free-text store name (if user picked "Other / not listed")
 *   existingProductId? — real product UUID when the product IS known but has no
 *                        pricing (skips the product upsert, only saves pricing)
 *
 * Returns: { productId: string; storeId: string | null }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    return await handleRequest(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[manual-submit] unhandled error:', message);
    return errorResponse(`Internal error: ${message}`, 500);
  }
});

async function handleRequest(req: Request) {
  let body: {
    barcode?: string;
    productName?: string;
    price?: number;
    storeId?: string | null;
    customStoreName?: string | null;
    existingProductId?: string | null;
    brand?: string | null;
    size?: string | null;
    unit?: string | null;
    categories?: string[] | null;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { barcode, productName, price, customStoreName, existingProductId, brand, size, unit, categories } = body;
  let { storeId } = body;

  if (!price || price <= 0) return errorResponse('price is required and must be > 0');
  if (!storeId && !customStoreName) return errorResponse('storeId or customStoreName is required');
  if (!existingProductId && (!barcode || !productName)) {
    return errorResponse('barcode and productName are required when existingProductId is not provided');
  }

  const db = getAdminClient();

  // 1. Create a new store row if the user typed a custom store name.
  if (customStoreName && !storeId) {
    const { data: newStore, error: storeErr } = await db
      .from('stores')
      .insert({ chain: 'custom', name: customStoreName.trim(), active: true })
      .select('id')
      .single();

    if (storeErr || !newStore) {
      return errorResponse(`Failed to create store: ${storeErr?.message ?? 'unknown error'}`, 500);
    }
    storeId = newStore.id as string;
  }

  // 2. Find or create the product (skip if we already have a real product UUID).
  // We do a select-then-insert rather than upsert because the unique index on
  // `upc` is a partial index (WHERE upc IS NOT NULL), which PostgreSQL does not
  // use for ON CONFLICT resolution — a plain upsert would always try to insert
  // and fail on duplicate barcodes.
  let productId = existingProductId ?? null;

  if (!productId) {
    // Check if the barcode is already in the DB (e.g. user scans the same unknown
    // item twice and enters it manually both times).
    const { data: existing } = await db
      .from('products')
      .select('id')
      .eq('upc', barcode)
      .maybeSingle();

    if (existing) {
      productId = existing.id as string;
      // Patch any newly-provided optional fields onto the existing row.
      const patch: Record<string, unknown> = {};
      if (brand?.trim()) patch.brand = brand.trim();
      if (size?.trim()) patch.size = size.trim();
      if (unit?.trim()) patch.unit = unit.trim();
      if (categories && categories.length > 0) patch.categories = categories;
      if (Object.keys(patch).length > 0) {
        await db.from('products').update(patch).eq('id', productId);
      }
    } else {
      const { data: inserted, error: insertErr } = await db
        .from('products')
        .insert({
          name: productName!.trim(),
          upc: barcode,
          barcode,
          brand: brand?.trim() ?? null,
          size: size?.trim() ?? null,
          unit: unit?.trim() ?? null,
          categories: categories ?? [],
        })
        .select('id')
        .single();

      if (insertErr || !inserted) {
        return errorResponse(`Failed to save product: ${insertErr?.message ?? 'unknown error'}`, 500);
      }
      productId = inserted.id as string;
    }
  }

  // 3. Upsert store_pricing with confidence 1.0 (user-verified price).
  if (storeId) {
    const { error: pricingErr } = await db
      .from('store_pricing')
      .upsert(
        {
          store_id: storeId,
          product_id: productId,
          regular_price: price,
          sale_price: null,
          confidence_score: 1.0,
          source: 'manual',
          source_timestamp: new Date().toISOString(),
        },
        { onConflict: 'store_id,product_id,source' }
      );

    if (pricingErr) {
      return errorResponse(`Failed to save pricing: ${pricingErr.message}`, 500);
    }
  }

  return jsonResponse({ productId, storeId: storeId ?? null });
}
