export interface StorePricing {
  id: string;
  storeId: string;
  productId: string;
  regularPrice: number | null;
  salePrice: number | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  sourceTimestamp: string;
  confidenceScore: number;
  source: string;
}

export type FreshnessLabel = 'live' | 'recent' | 'stale' | 'cached';

export interface PricedProduct {
  pricing: StorePricing[];
  freshnessLabel: FreshnessLabel;
  bestPrice: number | null;
}
