import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveBarcode, lookupProductByBarcode, EdgeFunctionError, type ScanResult } from '../services/api';
import { trackError } from '../services/analytics';
import type { Product } from '../types/product';

export type ProductNotFoundReason = 'not_found' | 'server_error' | 'network_error';

export class ProductNotFoundError extends Error {
  suggestions: Product[];
  reason: ProductNotFoundReason;
  status: number | null;
  constructor(suggestions: Product[], reason: ProductNotFoundReason, status: number | null = null) {
    super('UNKNOWN_BARCODE');
    this.name = 'ProductNotFoundError';
    this.suggestions = suggestions;
    this.reason = reason;
    this.status = status;
  }
}

const PRODUCT_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
const PRICING_TTL_MS = 4 * 60 * 60 * 1000;         // 4 hours
const PROMOTIONS_TTL_MS = 2 * 60 * 60 * 1000;      // 2 hours

export interface CachedProduct {
  scanResult: ScanResult;
  resolvedAt: number;
  pricingResolvedAt: number;
}

interface ProductState {
  cache: Record<string, CachedProduct>;
  resolveProduct: (
    barcode: string,
    storeId: string | null,
    location: { state: string | null; zip: string | null },
    forceRefresh?: boolean
  ) => Promise<ScanResult>;
  searchResults: Product[];
  evictExpired: () => void;
  clearCache: () => void;
}

export const useProductStore = create<ProductState>()(
  persist(
    (set, get) => ({
      cache: {},
      searchResults: [],

      resolveProduct: async (barcode, storeId, location, forceRefresh = false) => {
        const cached = get().cache[barcode];
        const now = Date.now();

        if (!forceRefresh && cached) {
          const productFresh = now - cached.resolvedAt < PRODUCT_TTL_MS;
          const pricingFresh = now - cached.pricingResolvedAt < PRICING_TTL_MS;
          if (productFresh && pricingFresh) return cached.scanResult;
        }

        let result: ScanResult;
        try {
          result = await resolveBarcode(barcode, storeId, location);
        } catch (err: unknown) {
          // scan-resolve returned 404 or errored. Fall back to a direct Supabase
          // products table query so manually-entered items are always found on re-scan.
          const fallback = await lookupProductByBarcode(barcode);
          if (fallback) {
            result = fallback;
          } else {
            // Product no longer exists in DB — evict the stale cache entry so
            // future scans don't serve a deleted item.
            set((state) => {
              const next = { ...state.cache };
              delete next[barcode];
              return { cache: next };
            });

            // Extract fuzzy suggestions from the 404 response body if available, and
            // distinguish a genuine "not found" from a network/server failure that
            // was previously indistinguishable in PostHog's barcode_scanned data.
            let suggestions: Product[] = [];
            let reason: ProductNotFoundReason = 'network_error';

            if (err instanceof EdgeFunctionError && err.status === 404) {
              reason = 'not_found';
              if (err.body) {
                try {
                  suggestions = (JSON.parse(err.body) as { suggestions?: Product[] }).suggestions ?? [];
                } catch (parseErr) {
                  trackError('resolveProduct:parse404Body', parseErr, { barcode });
                }
              }
            } else if (err instanceof EdgeFunctionError && err.status !== null) {
              reason = 'server_error';
              trackError('resolveProduct:unexpectedFailure', err, { barcode, status: err.status });
            } else {
              trackError('resolveProduct:unexpectedFailure', err, { barcode });
            }

            throw new ProductNotFoundError(
              suggestions,
              reason,
              err instanceof EdgeFunctionError ? err.status : null
            );
          }
        }

        set((state) => ({
          cache: {
            ...state.cache,
            [barcode]: { scanResult: result, resolvedAt: now, pricingResolvedAt: now },
          },
        }));
        return result;
      },

      evictExpired: () => {
        const now = Date.now();
        set((state) => {
          const next: Record<string, CachedProduct> = {};
          for (const [key, entry] of Object.entries(state.cache)) {
            if (now - entry.resolvedAt < PRODUCT_TTL_MS) next[key] = entry;
          }
          return { cache: next };
        });
      },

      clearCache: () => set({ cache: {} }),
    }),
    {
      name: 'product-store-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ cache: s.cache }),
      skipHydration: true,
    }
  )
);
