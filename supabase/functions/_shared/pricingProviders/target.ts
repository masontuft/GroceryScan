import type { PricingProvider, StorePricingResult } from './types.ts';

// Target Redsky API — unofficial consumer API, no auth required.
// Two-step: keyword search by UPC → tcin → pricing by store.
// Confidence 0.85: accessible but not a formally documented partner API.
export class TargetProvider implements PricingProvider {
  name = 'target';
  supportedChains = ['target'];

  async fetchPrice(barcode: string, locationId: string): Promise<StorePricingResult | null> {
    try {
      // Step 1: resolve UPC → Target's internal tcin
      const searchUrl = `https://redsky.target.com/redsky_aggregations/v1/web/product_summary_with_fulfillment_v1?keyword=${encodeURIComponent(barcode)}&channel=WEB&count=1&default_purchasability_filter=true`;
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GroceryScan/1.0)' },
      });
      if (!searchRes.ok) return null;

      const searchJson = await searchRes.json() as {
        data?: {
          search?: {
            products?: Array<{ tcin?: string }>;
          };
        };
      };

      const tcin = searchJson.data?.search?.products?.[0]?.tcin;
      if (!tcin) return null;

      // Step 2: fetch pricing by tcin + store
      const storeId = locationId || '1122'; // fallback to a generic Target store ID
      const priceUrl = `https://redsky.target.com/redsky_aggregations/v1/web/pdp_client_v1?tcin=${tcin}&pricing_store_id=${storeId}&channel=WEB`;
      const priceRes = await fetch(priceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GroceryScan/1.0)' },
      });
      if (!priceRes.ok) return null;

      const priceJson = await priceRes.json() as {
        data?: {
          product?: {
            price?: {
              current_retail?: number;
              reg_retail?: number;
            };
          };
        };
      };

      const price = priceJson.data?.product?.price;
      if (!price?.current_retail) return null;

      const currentPrice = price.current_retail;
      const regPrice = price.reg_retail ?? currentPrice;
      const isOnSale = currentPrice < regPrice;

      return {
        regularPrice: regPrice,
        salePrice: isOnSale ? currentPrice : null,
        effectiveStart: null,
        effectiveEnd: null,
        confidenceScore: 0.85,
        source: 'target',
        sourceTimestamp: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}
