import type { PricingProvider, StorePricingResult } from './types.ts';

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
    try {
      const url = `https://connect.instacart.com/idp/v1/products/products_by_upc?upc=${barcode}&retailer_key=${locationId}`;
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
