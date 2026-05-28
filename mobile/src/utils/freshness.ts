import type { FreshnessLabel } from '../types/pricing';

export function getFreshnessLabel(sourceTimestamp: string): FreshnessLabel {
  const ageMs = Date.now() - new Date(sourceTimestamp).getTime();
  const hours = ageMs / (1000 * 60 * 60);
  if (hours < 1) return 'live';
  if (hours < 4) return 'recent';
  if (hours < 24) return 'stale';
  return 'cached';
}

export function freshnessColor(label: FreshnessLabel): string {
  switch (label) {
    case 'live': return '#22c55e';
    case 'recent': return '#84cc16';
    case 'stale': return '#f59e0b';
    case 'cached': return '#94a3b8';
  }
}
