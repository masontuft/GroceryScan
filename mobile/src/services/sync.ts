import NetInfo from '@react-native-community/netinfo';
import { useProductStore } from '../stores/productStore';
import { useBasketStore } from '../stores/basketStore';
import { useLocationStore } from '../stores/locationStore';
import { useStoreStore } from '../stores/storeStore';

const PRICING_TTL_MS = 4 * 60 * 60 * 1000;

let syncUnsubscribe: (() => void) | null = null;

export function startSyncListener() {
  if (syncUnsubscribe) return;

  syncUnsubscribe = NetInfo.addEventListener(async (state) => {
    if (!state.isConnected) return;

    const productStore = useProductStore.getState();
    const basketStore = useBasketStore.getState();
    const locationStore = useLocationStore.getState();
    const storeStore = useStoreStore.getState();

    const now = Date.now();
    const expiredBarcodes = Object.entries(productStore.cache)
      .filter(([, entry]) => now - entry.pricingResolvedAt > PRICING_TTL_MS)
      .map(([barcode]) => barcode);

    // Re-fetch expired pricing entries sequentially (rate-limited)
    for (const barcode of expiredBarcodes) {
      try {
        await productStore.resolveProduct(
          barcode,
          storeStore.selectedStoreId,
          { state: locationStore.state, zip: locationStore.zip },
          true
        );
        await new Promise((r) => setTimeout(r, 300)); // 300ms between requests
      } catch {
        // Best-effort sync; ignore individual failures
      }
    }

    if (basketStore.items.length > 0) {
      await basketStore.recalculate();
    }
  });
}

export function stopSyncListener() {
  syncUnsubscribe?.();
  syncUnsubscribe = null;
}
