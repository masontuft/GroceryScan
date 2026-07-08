export interface StorePricingResult {
  regularPrice: number | null;
  salePrice: number | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  confidenceScore: number;
  source: string;
  sourceTimestamp: string;
}

export interface ProductInfo {
  name: string | null;
  brand: string | null;
}

export interface PricingProvider {
  name: string;
  supportedChains: string[];  // ['kroger'] or ['*'] for aggregators
  fetchPrice(
    barcode: string,
    locationId: string,
    productInfo?: ProductInfo,
  ): Promise<StorePricingResult | null>;
}
