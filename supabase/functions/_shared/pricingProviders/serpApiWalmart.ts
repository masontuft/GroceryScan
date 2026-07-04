import type { PricingProvider, StorePricingResult } from './types.ts';

// SerpApi Walmart integration: https://serpapi.com/walmart-search-api / walmart-product-api
// Neither engine accepts a UPC/barcode as an input parameter — barcode lookup
// only works by resolving to a text search, then confirming the winning
// candidate's UPC via the product-detail response before trusting its price.
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

  async fetchPrice(barcode: string, locationId: string): Promise<StorePricingResult | null> {
    if (!this.apiKey) return null;
    try {
      const searchParams = new URLSearchParams({ engine: 'walmart', query: barcode, api_key: this.apiKey });
      if (locationId) searchParams.set('store_id', locationId);

      const searchRes = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`);
      if (!searchRes.ok) return null;
      const searchJson = await searchRes.json() as {
        organic_results?: Array<{ product_id?: string; us_item_id?: string }>;
      };

      const candidates = (searchJson.organic_results ?? []).slice(0, 3);

      for (const candidate of candidates) {
        const productId = candidate.product_id ?? candidate.us_item_id;
        if (!productId) continue;

        const productParams = new URLSearchParams({
          engine: 'walmart_product',
          product_id: productId,
          api_key: this.apiKey,
        });
        if (locationId) productParams.set('store_id', locationId);

        const productRes = await fetch(`https://serpapi.com/search.json?${productParams.toString()}`);
        if (!productRes.ok) continue;
        const productJson = await productRes.json() as {
          product_result?: { upc?: string; price?: number; was_price?: number };
        };

        const result = productJson.product_result;
        if (!result?.price) continue;

        // A confirmed UPC mismatch means the text search matched the wrong
        // product — skip it rather than binding this barcode to its price.
        const upcMatches = result.upc ? normalizeBarcode(result.upc) === normalizeBarcode(barcode) : null;
        if (upcMatches === false) continue;

        const regularPrice = result.was_price ?? result.price;
        const salePrice = result.price < regularPrice ? result.price : null;

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

function normalizeBarcode(code: string): string {
  return code.replace(/^0+/, '');
}
