import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchStores, type Store } from '../services/api';

interface StoreState {
  selectedStoreId: string | null;
  stores: Store[];
  loading: boolean;
  fetchStores: () => Promise<void>;
  selectStore: (id: string) => void;
}

export const useStoreStore = create<StoreState>()(
  persist(
    (set) => ({
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

      selectStore: (id) => set({ selectedStoreId: id }),
    }),
    {
      name: 'store-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ selectedStoreId: s.selectedStoreId }),
    }
  )
);
