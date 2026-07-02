import type { FreshnessLabel, StorePricing } from '../types/pricing';

export function getFreshnessLabel(sourceTimestamp: string): FreshnessLabel {
  const ageMs = Date.now() - new Date(sourceTimestamp).getTime();
  const hours = ageMs / (1000 * 60 * 60);
  if (hours < 1) return 'live';
  if (hours < 4) return 'recent';
  if (hours < 24) return 'stale';
  return 'cached';
}

// Manually-entered shelf prices (e.g. WinCo) don't change hourly like API-polled
// prices do, so they get a much longer staleness window before we ask a user
// to re-verify them.
export const MANUAL_PRICE_STALE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export function isManualPriceStale(sourceTimestamp: string): boolean {
  return Date.now() - new Date(sourceTimestamp).getTime() > MANUAL_PRICE_STALE_MS;
}

export function findStorePrice(
  pricing: StorePricing[],
  storeId: string | null,
  source = 'manual'
): StorePricing | null {
  if (!storeId) return null;
  return pricing.find((p) => p.storeId === storeId && p.source === source) ?? null;
}

/**
 * Whether a displayed price should be flagged as potentially outdated.
 * Manual (shelf-verified) prices use their own 3-day window since they don't
 * change hourly like API-polled prices; everything else falls back to the
 * live/recent/stale/cached freshness scale.
 */
export function isPriceStale(source: StorePricing | null, freshnessLabel: FreshnessLabel): boolean {
  if (!source) return false;
  if (source.source === 'manual') return isManualPriceStale(source.sourceTimestamp);
  return freshnessLabel === 'stale' || freshnessLabel === 'cached';
}

export function freshnessColor(label: FreshnessLabel): string {
  switch (label) {
    case 'live': return '#22c55e';
    case 'recent': return '#84cc16';
    case 'stale': return '#f59e0b';
    case 'cached': return '#94a3b8';
  }
}
