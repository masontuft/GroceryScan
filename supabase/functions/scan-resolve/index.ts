import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { KrogerProvider } from '../_shared/pricingProviders/kroger.ts';
import { InstacartProvider } from '../_shared/pricingProviders/instacart.ts';
import { WalmartProvider } from '../_shared/pricingProviders/walmart.ts';
import { TargetProvider } from '../_shared/pricingProviders/target.ts';
import type { PricingProvider, StorePricingResult } from '../_shared/pricingProviders/types.ts';
import { extractManufacturerPrefix } from '../_shared/gs1.ts';

// Domain → store chain mapping for UPCitemdb offer mining.
// Offers from these merchants are surfaced as fallback pricing (confidence 0.65).
const UPCITEMDB_OFFER_DOMAIN_MAP: Record<string, string> = {
  'walmart.com': 'walmart',
  'costco.com': 'costco',
  'samsclub.com': 'sams_club',
  'target.com': 'target',
};

const providers: PricingProvider[] = [
  new KrogerProvider(
    Deno.env.get('KROGER_CLIENT_ID') ?? '',
    Deno.env.get('KROGER_CLIENT_SECRET') ?? '',
  ),
  new InstacartProvider(Deno.env.get('INSTACART_API_KEY') ?? ''),
  new WalmartProvider(
    Deno.env.get('WALMART_CONSUMER_ID') ?? '',
    Deno.env.get('WALMART_PRIVATE_KEY') ?? '',
  ),
  new TargetProvider(),
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

  const upcitemdbOfferPricing: Array<{ chain: string; result: StorePricingResult }> = [];

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
            offers?: Array<{ domain?: string; price?: number; list_price?: number }>;
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
                manufacturer_prefix: extractManufacturerPrefix(barcode),
              }, { onConflict: 'upc' })
              .select()
              .single();
            product = inserted;

            // Mine UPCitemdb offers for chain-specific fallback pricing.
            // These reflect online/catalog prices (confidence 0.65), useful for
            // chains without a dedicated provider (Costco, WinCo, Sam's Club, etc.).
            for (const offer of item.offers ?? []) {
              const chain = offer.domain ? UPCITEMDB_OFFER_DOMAIN_MAP[offer.domain] : undefined;
              if (!chain || !offer.price) continue;
              upcitemdbOfferPricing.push({
                chain,
                result: {
                  regularPrice: offer.list_price ?? offer.price,
                  salePrice: offer.list_price && offer.price < offer.list_price ? offer.price : null,
                  effectiveStart: null,
                  effectiveEnd: null,
                  confidenceScore: 0.65,
                  source: `upcitemdb_offers:${chain}`,
                  sourceTimestamp: new Date().toISOString(),
                },
              });
            }
          }
        }
      } catch {
        // Continue without external lookup
      }
    }

    // Open Food Facts fallback — free, no key required, 4M+ products.
    // Used when upcitemdb also returns nothing. Adds rich product identity data.
    if (!product) {
      try {
        const offRes = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
          { headers: { 'User-Agent': 'GroceryScan/1.0 (masontuft@gmail.com)' } }
        );
        if (offRes.ok) {
          const offJson = await offRes.json() as {
            status?: number;
            product?: {
              product_name?: string;
              brands?: string;
              image_url?: string;
              quantity?: string;
              categories_tags?: string[];
            };
          };
          if (offJson.status === 1 && offJson.product?.product_name) {
            const p = offJson.product;
            const categories = (p.categories_tags ?? [])
              .map((t: string) => t.replace(/^en:/, ''))
              .filter((t: string) => !t.includes(':'))
              .slice(0, 3);
            const { data: inserted } = await db
              .from('products')
              .upsert({
                name: p.product_name,
                brand: p.brands?.split(',')[0]?.trim() ?? null,
                upc: barcode,
                barcode,
                image_url: p.image_url ?? null,
                size: p.quantity ?? null,
                categories,
                manufacturer_prefix: extractManufacturerPrefix(barcode),
              }, { onConflict: 'upc' })
              .select()
              .single();
            product = inserted;
          }
        }
      } catch {
        // Continue — OFF unavailable
      }
    }
  }

  if (!product) {
    // Return fuzzy suggestions so the mobile client can show "Did you mean?"
    const { data: suggestions } = await db.rpc('search_products_fuzzy', { query: barcode, threshold: 0.3 });
    return jsonResponse({ error: 'Product not found', barcode, suggestions: suggestions ?? [] }, 404);
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

  // 4. Upsert pricing rows from providers
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

  // 4b. Upsert UPCitemdb offer pricing for matching store chain
  if (storeId && storeChain !== 'unknown') {
    const matchingOffers = upcitemdbOfferPricing.filter((o) => o.chain === storeChain);
    if (matchingOffers.length > 0) {
      await db.from('store_pricing').upsert(
        matchingOffers.map(({ result: p }) => ({
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

  const matchingOfferResults = upcitemdbOfferPricing
    .filter((o) => o.chain === storeChain)
    .map((o) => o.result);
  const allFreshPricing = [...freshPricing, ...matchingOfferResults];
  const confidence = allFreshPricing.length > 0
    ? Math.max(...allFreshPricing.map((p) => p.confidenceScore))
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
      manufacturerPrefix: product.manufacturer_prefix ?? null,
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
