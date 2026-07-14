import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recalculateBasket, EdgeFunctionError } from '../services/api';
import { track, trackError } from '../services/analytics';
import { useLocationStore } from './locationStore';
import type { BasketItem, BasketTotal } from '../types/basket';

interface BasketState {
  items: BasketItem[];
  storeId: string | null;
  lastTotal: BasketTotal | null;
  loading: boolean;
  // Set when the last recalculate() call failed — lastTotal is stale when true,
  // so the UI should prefer the locally-computed estimate and offer a retry.
  recalcError: boolean;

  addItem: (item: BasketItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  updateItem: (productId: string, changes: Partial<Pick<BasketItem, 'name' | 'unitPrice' | 'category' | 'taxable' | 'taxableOverridden' | 'notes'>>) => void;
  clearBasket: () => void;
  setStore: (storeId: string | null) => void;
  recalculate: () => Promise<void>;
}

export const useBasketStore = create<BasketState>()(
  persist(
    (set, get) => ({
      items: [],
      storeId: null,
      lastTotal: null,
      loading: false,
      recalcError: false,

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return { items: [...state.items, item] };
        });
        track('product_added_to_basket', {
          productId: item.productId,
          category: item.category,
          unitPrice: item.unitPrice,
          storeId: get().storeId,
        });
        get().recalculate();
      },

      removeItem: (productId) => {
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) }));
        get().recalculate();
      },

      updateQuantity: (productId, qty) => {
        if (qty <= 0) {
          get().removeItem(productId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)),
        }));
        get().recalculate();
      },

      updateItem: (productId, changes) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, ...changes } : i
          ),
        }));
        get().recalculate();
      },

      clearBasket: () => {
        track('basket_cleared', { itemCount: get().items.length });
        set({ items: [], lastTotal: null });
      },

      setStore: (storeId) => set({ storeId }),

      recalculate: async () => {
        const { items, storeId } = get();
        if (items.length === 0) {
          set({ lastTotal: { subtotal: 0, discounts: 0, tax: 0, estimatedTotal: 0 } });
          return;
        }
        set({ loading: true, recalcError: false });
        try {
          // Read directly from locationStore rather than keeping a local copy —
          // a separate `location` field here previously went stale forever
          // (nothing ever wrote to it), silently sending state:null on every
          // recalculation and making the backend return $0 tax regardless of
          // the user's actual location.
          const { state, zip } = useLocationStore.getState();
          const total = await recalculateBasket(storeId, items, { state, zip });
          set({ lastTotal: total, loading: false, recalcError: false });
        } catch (err) {
          // Keep last known total in state (some screens may still read it), but
          // recalcError tells the UI it's stale so it can fall back to a local
          // estimate and offer a retry instead of showing a silently wrong total.
          trackError('basketStore:recalculate', err, {
            itemCount: items.length,
            storeId,
            ...(err instanceof EdgeFunctionError ? { endpoint: err.endpoint, status: err.status } : {}),
          });
          set({ loading: false, recalcError: true });
        }
      },
    }),
    {
      name: 'basket-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items, storeId: s.storeId }),
      skipHydration: true,
    }
  )
);
