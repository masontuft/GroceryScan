import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchStores, resolveNearbyStore, type Store } from '../services/api';
import { track, trackError } from '../services/analytics';

interface StoreState {
  selectedStoreId: string | null;
  stores: Store[];
  loading: boolean;
  fetchStores: () => Promise<void>;
  selectStore: (id: string) => void;
  resolveNearbyWalmart: (lat: number, lng: number) => Promise<Store | null>;
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
        } catch (err) {
          trackError('storeStore:fetchStores', err);
          set({ loading: false });
        }
      },

      selectStore: (id) => {
        set({ selectedStoreId: id });
        const store = get().stores.find((s) => s.id === id);
        track('store_selected', { storeId: id, chain: store?.chain ?? null });
      },

      resolveNearbyWalmart: async (lat, lng) => {
        try {
          const store = await resolveNearbyStore({ chain: 'walmart', lat, lng });
          if (store) {
            set((s) => ({
              stores: s.stores.some((x) => x.id === store.id)
                ? s.stores.map((x) => (x.id === store.id ? store : x))
                : [...s.stores, store],
            }));
            get().selectStore(store.id);
          }
          return store;
        } catch (err) {
          trackError('storeStore:resolveNearbyWalmart', err);
          return null;
        }
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
