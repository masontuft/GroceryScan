import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { KrogerProvider } from '../_shared/pricingProviders/kroger.ts';
import { InstacartProvider } from '../_shared/pricingProviders/instacart.ts';
import type { PricingProvider } from '../_shared/pricingProviders/types.ts';

const providers: PricingProvider[] = [
  new KrogerProvider(
    Deno.env.get('KROGER_CLIENT_ID') ?? '',
    Deno.env.get('KROGER_CLIENT_SECRET') ?? '',
  ),
  new InstacartProvider(Deno.env.get('INSTACART_API_KEY') ?? ''),
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  let body: { barcode?: string; storeId?: string | null; location?: { state?: string | null; zip?: string | null } };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { barcode, storeId, location } = body;
  if (!barcode) return errorResponse('barcode is required');

  const db = getAdminClient();

  // 1. Look up product in DB
  let product = null;
  const { data: existing } = await db
    .from('products')
    .select('*')
    .or(`barcode.eq.${barcode},upc.eq.${barcode},ean.eq.${barcode},gtin.eq.${barcode}`)
    .maybeSingle();

  if (existing) {
    product = existing;
  } else {
    // 2. Fall back to barcode lookup API (free trial needs no key; paid uses /v1/ + user_key header)
    const apiKey = Deno.env.get('BARCODE_LOOKUP_API_KEY');
    {
      try {
        const endpoint = apiKey
          ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${barcode}`
          : `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`;
        const headers: Record<string, string> = { 'User-Agent': 'GroceryScan/1.0' };
        if (apiKey) { headers['user_key'] = apiKey; headers['key_type'] = 'string'; }
        const res = await fetch(endpoint, { headers });
        if (res.ok) {
          const json = await res.json() as { items?: Array<{
            title?: string; brand?: string; images?: string[]; description?: string;
            size?: string; weight?: string; category?: string;
          }> };
          const item = json.items?.[0];
          if (item) {
            const { data: inserted } = await db
              .from('products')
              .upsert({
                name: item.title ?? 'Unknown Product',
                brand: item.brand ?? null,
                upc: barcode,
                barcode,
                image_url: item.images?.[0] ?? null,
                size: item.size ?? item.weight ?? null,
                categories: item.category ? [item.category] : [],
              }, { onConflict: 'upc' })
              .select()
              .single();
            product = inserted;
          }
        }
      } catch {
        // Continue without external lookup
      }
    }
  }

  if (!product) {
    return jsonResponse({ error: 'Product not found', barcode }, 404);
  }

  // 3. Fan out to pricing providers
  let storeChain = 'unknown';
  let storeLocationId = storeId ?? '';

  if (storeId) {
    const { data: storeRow } = await db.from('stores').select('chain, location_id').eq('id', storeId).maybeSingle();
    if (storeRow) {
      storeChain = storeRow.chain;
      storeLocationId = storeRow.location_id ?? storeId;
    }
  }

  const matchingProviders = providers.filter(
    (p) => p.supportedChains.includes('*') || p.supportedChains.includes(storeChain)
  );

  const pricingResults = await Promise.allSettled(
    matchingProviders.map((p) => p.fetchPrice(barcode, storeLocationId))
  );

  const freshPricing = pricingResults
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<PricingProvider['fetchPrice']>>> =>
      r.status === 'fulfilled' && r.value !== null
    )
    .map((r) => r.value!);

  // 4. Upsert pricing rows
  if (freshPricing.length > 0 && storeId) {
    await db.from('store_pricing').upsert(
      freshPricing.map((p) => ({
        store_id: storeId,
        product_id: product.id,
        regular_price: p.regularPrice,
        sale_price: p.salePrice,
        effective_start: p.effectiveStart,
        effective_end: p.effectiveEnd,
        source_timestamp: p.sourceTimestamp,
        confidence_score: p.confidenceScore,
        source: p.source,
      })),
      { onConflict: 'store_id,product_id,source' }
    );
  }

  // 5. Load all pricing for this product (including any cached)
  const { data: allPricing } = storeId
    ? await db.from('store_pricing').select('*').eq('product_id', product.id).eq('store_id', storeId)
    : { data: [] };

  // 6. Load active promotions
  const now = new Date().toISOString();
  const { data: promotions } = storeId
    ? await db.from('promotions')
        .select('*')
        .eq('product_id', product.id)
        .eq('store_id', storeId)
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`)
    : { data: [] };

  const confidence = freshPricing.length > 0
    ? Math.max(...freshPricing.map((p) => p.confidenceScore))
    : (allPricing?.length ?? 0) > 0 ? 0.5 : 0;

  return jsonResponse({
    product: {
      id: product.id,
      name: product.name,
      brand: product.brand,
      barcode: product.barcode,
      upc: product.upc,
      ean: product.ean,
      gtin: product.gtin,
      sku: product.sku,
      size: product.size,
      unit: product.unit,
      imageUrl: product.image_url,
      categories: product.categories ?? [],
    },
    pricing: (allPricing ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      storeId: row.store_id,
      productId: row.product_id,
      regularPrice: row.regular_price,
      salePrice: row.sale_price,
      effectiveStart: row.effective_start,
      effectiveEnd: row.effective_end,
      sourceTimestamp: row.source_timestamp,
      confidenceScore: row.confidence_score,
      source: row.source,
    })),
    promotions: (promotions ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      storeId: row.store_id,
      productId: row.product_id,
      type: row.type,
      description: row.description,
      discountValue: row.discount_value,
      eligibilityRules: row.eligibility_rules,
      startDate: row.start_date,
      endDate: row.end_date,
      version: row.version,
    })),
    confidence,
  });
});
