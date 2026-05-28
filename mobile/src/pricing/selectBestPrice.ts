import type { StorePricing, FreshnessLabel } from '../types/pricing';
import { getFreshnessLabel } from '../utils/freshness';

export interface BestPrice {
  price: number | null;
  isOnSale: boolean;
  regularPrice: number | null;
  source: StorePricing | null;
  freshnessLabel: FreshnessLabel;
}

export function selectBestPrice(pricingRows: StorePricing[]): BestPrice {
  if (pricingRows.length === 0) {
    return { price: null, isOnSale: false, regularPrice: null, source: null, freshnessLabel: 'cached' };
  }

  const sorted = [...pricingRows].sort((a, b) => {
    // Priority: highest confidence → freshest → lowest sale price
    if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
    const aTime = new Date(a.sourceTimestamp).getTime();
    const bTime = new Date(b.sourceTimestamp).getTime();
    if (bTime !== aTime) return bTime - aTime;
    const aPrice = a.salePrice ?? a.regularPrice ?? Infinity;
    const bPrice = b.salePrice ?? b.regularPrice ?? Infinity;
    return aPrice - bPrice;
  });

  const best = sorted[0];
  const effectivePrice = best.salePrice ?? best.regularPrice;
  const isOnSale = best.salePrice !== null && best.regularPrice !== null && best.salePrice < best.regularPrice;

  return {
    price: effectivePrice,
    isOnSale,
    regularPrice: best.regularPrice,
    source: best,
    freshnessLabel: getFreshnessLabel(best.sourceTimestamp),
  };
}
