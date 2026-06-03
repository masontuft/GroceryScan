import type { PricingProvider, StorePricingResult } from './types.ts';

// Maps store chain slugs to Instacart's retailer_key identifiers.
// When the chain is known, pass the explicit key for better hit rates.
// Falls back to locationId (which may already be a retailer_key for Instacart-native stores).
const CHAIN_TO_RETAILER_KEY: Record<string, string> = {
  costco: 'costco',
  winco: 'winco_foods',
  walmart: 'walmart',
  safeway: 'safeway',
  albertsons: 'albertsons',
  publix: 'publix',
  heb: 'heb',
  wegmans: 'wegmans',
  sprouts: 'sprouts',
  whole_foods: 'whole_foods',
  target: 'target',
  cvs: 'cvs',
  walgreens: 'walgreens',
};

/**
 * Instacart Connect API provider.
 * Covers many grocery chains as a catch-all aggregator.
 * Docs: https://docs.instacart.com/connect
 */
export class InstacartProvider implements PricingProvider {
  name = 'instacart';
  supportedChains = ['*'];  // aggregator — covers all chains

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchPrice(barcode: string, locationId: string): Promise<StorePricingResult | null> {
    // Prefer the explicit Instacart retailer_key for the chain when available.
    // locationId for Instacart-native stores is already the retailer_key (e.g. 'safeway').
    const retailerKey = CHAIN_TO_RETAILER_KEY[locationId] ?? locationId;
    try {
      const url = `https://connect.instacart.com/idp/v1/products/products_by_upc?upc=${barcode}&retailer_key=${retailerKey}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) return null;
      const json = await res.json() as {
        products?: Array<{
          price?: number;
          original_price?: number;
          sale?: boolean;
        }>;
      };

      const product = json.products?.[0];
      if (!product?.price) return null;

      const regularPrice = product.original_price ?? product.price;
      const salePrice = product.sale ? product.price : null;

      return {
        regularPrice,
        salePrice,
        effectiveStart: null,
        effectiveEnd: null,
        confidenceScore: 0.80,
        source: 'instacart',
        sourceTimestamp: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}
