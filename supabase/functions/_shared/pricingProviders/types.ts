export interface StorePricingResult {
  regularPrice: number | null;
  salePrice: number | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  confidenceScore: number;
  source: string;
  sourceTimestamp: string;
}

export interface PricingProvider {
  name: string;
  supportedChains: string[];  // ['kroger'] or ['*'] for aggregators
  fetchPrice(
    barcode: string,
    locationId: string,
  ): Promise<StorePricingResult | null>;
}
