import type { PricingProvider, ProductInfo, StorePricingResult } from './types.ts';

// SerpApi Walmart integration: https://serpapi.com/walmart-search-api / walmart-product-api
// Confirmed empirically: the `walmart` engine's `query` param is a text search
// against walmart.com's on-site search, which does NOT index products by raw
// UPC/barcode digits — searching by barcode returned zero organic_results for
// real, widely-stocked products. So the search query has to be the product's
// name (+ brand when available); the barcode is only used afterward, to
// confirm the winning candidate's UPC via the product-detail response before
// trusting its price. If no name is available (caller didn't pass
// productInfo), there's nothing usable to search with, so this returns null
// rather than falling back to a barcode query that's known not to work.
// Primary Walmart source (see WalmartProvider for the direct-by-UPC secondary):
// scraped listing prices track what's actually shown on walmart.com, whereas
// the Marketplace/Affiliate catalog data is known to lag real shelf pricing.
export class SerpApiWalmartProvider implements PricingProvider {
  name = 'serpapi_walmart';
  supportedChains = ['walmart'];

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchPrice(barcode: string, locationId: string, productInfo?: ProductInfo): Promise<StorePricingResult | null> {
    if (!this.apiKey) return null;
    const query = [productInfo?.brand, productInfo?.name].filter(Boolean).join(' ').trim();
    if (!query) return null;
    try {
      const searchParams = new URLSearchParams({ engine: 'walmart', query, api_key: this.apiKey });
      if (locationId) searchParams.set('store_id', locationId);

      const searchRes = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!searchRes.ok) return null;
      const searchJson = await searchRes.json() as {
        organic_results?: Array<{ product_id?: string; us_item_id?: string }>;
      };

      const candidates = (searchJson.organic_results ?? []).slice(0, 3);

      // Each candidate needs its own walmart_product lookup to get UPC/price —
      // fetched in parallel, not one-await-per-candidate: sequential awaits
      // here previously meant up to 4 chained SerpApi round-trips (search +
      // 3 product lookups) for one scan, 15-30s+ in practice, which made a
      // search-result tap look completely broken with no error to show for it.
      const details = await Promise.all(candidates.map(async (candidate) => {
        const productId = candidate.product_id ?? candidate.us_item_id;
        if (!productId) return null;
        try {
          const productParams = new URLSearchParams({
            engine: 'walmart_product',
            product_id: productId,
            api_key: this.apiKey,
          });
          if (locationId) productParams.set('store_id', locationId);

          const productRes = await fetch(`https://serpapi.com/search.json?${productParams.toString()}`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!productRes.ok) return null;
          const productJson = await productRes.json() as {
            product_result?: { upc?: string; price_map?: { price?: number; was_price?: number } };
          };
          return productJson.product_result ?? null;
        } catch {
          return null;
        }
      }));

      // Preserve the original candidate order (search relevance ranking) when
      // picking a winner, same priority as the old sequential loop.
      for (const result of details) {
        // Price lives under price_map (confirmed against a live response),
        // not top-level price/was_price fields — a plain product_result.price
        // is always undefined, which silently dropped every match before.
        const priceMap = result?.price_map;
        if (!priceMap?.price) continue;

        // A confirmed UPC mismatch means the text search matched the wrong
        // product — skip it rather than binding this barcode to its price.
        const upcMatches = result!.upc ? normalizeBarcode(result!.upc!) === normalizeBarcode(barcode) : null;
        if (upcMatches === false) continue;

        const regularPrice = priceMap.was_price ?? priceMap.price;
        const salePrice = priceMap.price < regularPrice ? priceMap.price : null;

        return {
          regularPrice,
          salePrice,
          effectiveStart: null,
          effectiveEnd: null,
          // Confirmed UPC match outranks the direct Marketplace API (0.90);
          // an unverified text-search hit (no upc in the response) rates lower.
          confidenceScore: upcMatches ? 0.93 : 0.70,
          source: 'serpapi_walmart',
          sourceTimestamp: new Date().toISOString(),
        };
      }

      return null;
    } catch {
      return null;
    }
  }
}

// Each fetch gets its own budget rather than one shared deadline across the
// search + parallel product lookups, so a slow product lookup can't also eat
// into the search call's allowance — keeps worst case bounded and predictable
// (~2x FETCH_TIMEOUT_MS) regardless of how many candidates come back.
const FETCH_TIMEOUT_MS = 8000;

function normalizeBarcode(code: string): string {
  return code.replace(/^0+/, '');
}
