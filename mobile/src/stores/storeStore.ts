import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchStores, type Store } from '../services/api';
import { track } from '../services/analytics';

interface StoreState {
  selectedStoreId: string | null;
  stores: Store[];
  loading: boolean;
  fetchStores: () => Promise<void>;
  selectStore: (id: string) => void;
}

export const useStoreStore = create<StoreState>()(
  persist(
    (set, get) => ({
      selectedStoreId: null,
      stores: [],
      loading: false,

      fetchStores: async () => {
        set({ loading: true });
        try {
          const stores = await fetchStores();
          set({ stores, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      selectStore: (id) => {
        set({ selectedStoreId: id });
        const store = get().stores.find((s) => s.id === id);
        track('store_selected', { storeId: id, chain: store?.chain ?? null });
      },
    }),
    {
      name: 'store-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ selectedStoreId: s.selectedStoreId }),
      skipHydration: true,
    }
  )
);
