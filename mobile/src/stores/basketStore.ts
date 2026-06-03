import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recalculateBasket } from '../services/api';
import type { BasketItem, BasketTotal } from '../types/basket';

interface BasketState {
  items: BasketItem[];
  storeId: string | null;
  location: { state: string | null; zip: string | null };
  lastTotal: BasketTotal | null;
  loading: boolean;

  addItem: (item: BasketItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  clearBasket: () => void;
  setStore: (storeId: string | null) => void;
  setLocation: (location: { state: string | null; zip: string | null }) => void;
  recalculate: () => Promise<void>;
}

export const useBasketStore = create<BasketState>()(
  persist(
    (set, get) => ({
      items: [],
      storeId: null,
      location: { state: null, zip: null },
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

      clearBasket: () => set({ items: [], lastTotal: null }),

      setStore: (storeId) => set({ storeId }),
      setLocation: (location) => set({ location }),

      recalculate: async () => {
        const { items, storeId, location } = get();
        if (items.length === 0) {
          set({ lastTotal: { subtotal: 0, discounts: 0, tax: 0, estimatedTotal: 0 } });
          return;
        }
        set({ loading: true });
        try {
          const total = await recalculateBasket(storeId, items, location);
          set({ lastTotal: total, loading: false });
        } catch {
          // keep last known total on error
          set({ loading: false });
        }
      },
    }),
    {
      name: 'basket-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items, storeId: s.storeId, location: s.location }),
      skipHydration: true,
    }
  )
);
