import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recalculateBasket } from '../services/api';
import { track, trackError } from '../services/analytics';
import { useLocationStore } from './locationStore';
import type { BasketItem, BasketTotal } from '../types/basket';

interface BasketState {
  items: BasketItem[];
  storeId: string | null;
  lastTotal: BasketTotal | null;
  loading: boolean;

  addItem: (item: BasketItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  updateItem: (productId: string, changes: Partial<Pick<BasketItem, 'name' | 'unitPrice' | 'category' | 'taxable' | 'notes'>>) => void;
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
        set({ loading: true });
        try {
          // Read directly from locationStore rather than keeping a local copy —
          // a separate `location` field here previously went stale forever
          // (nothing ever wrote to it), silently sending state:null on every
          // recalculation and making the backend return $0 tax regardless of
          // the user's actual location.
          const { state, zip } = useLocationStore.getState();
          const total = await recalculateBasket(storeId, items, { state, zip });
          set({ lastTotal: total, loading: false });
        } catch (err) {
          // keep last known total on error, but the user sees a silently stale
          // total with no indication anything failed unless this reaches PostHog
          trackError('basketStore:recalculate', err, { itemCount: items.length, storeId });
          set({ loading: false });
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
