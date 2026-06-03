import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveBarcode, type ScanResult } from '../services/api';
import type { Product } from '../types/product';

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

        const result = await resolveBarcode(barcode, storeId, location);
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
    }),
    {
      name: 'product-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ cache: s.cache }),
      skipHydration: true,
    }
  )
);
