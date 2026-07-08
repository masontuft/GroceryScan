import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { trackError } from '../services/analytics';

export type Coordinate = [lat: number, lng: number];

/**
 * Standalone device-coordinate fetch, separate from setFromGPS()'s
 * state/zip/city resolution (which is used for tax lookups). Not persisted —
 * coordinates here are only ever used transiently for a resolve-nearby-store
 * call. Never throws; returns null on missing permission or any failure.
 */
export async function getCurrentCoords(): Promise<Coordinate | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({});
    return [loc.coords.latitude, loc.coords.longitude];
  } catch (err) {
    trackError('locationStore:getCurrentCoords', err);
    return null;
  }
}

interface LocationState {
  state: string | null;
  zip: string | null;
  city: string | null;
  county: string | null;
  source: 'gps' | 'manual' | null;
  setFromGPS: () => Promise<void>;
  setManual: (state: string, zip: string) => void;
  clear: () => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      state: null,
      zip: null,
      city: null,
      county: null,
      source: null,

      setFromGPS: async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const loc = await Location.getCurrentPositionAsync({});
          const coords: Coordinate = [loc.coords.latitude, loc.coords.longitude];
          const [geo] = await Location.reverseGeocodeAsync({ latitude: coords[0], longitude: coords[1] });
          if (geo) {
            set({
              state: geo.region ?? null,
              zip: geo.postalCode ?? null,
              city: geo.city ?? null,
              county: geo.subregion ?? null,
              source: 'gps',
            });
          }
        } catch (err) {
          // Previously unhandled — this left the "Use My Location" button stuck
          // spinning forever in LocationScreen, since it never resolved/rejected
          // back to the screen's await. Catching here fixes that and surfaces why.
          trackError('locationStore:setFromGPS', err);
        }
      },

      setManual: (state, zip) => set({ state, zip, city: null, county: null, source: 'manual' }),
      clear: () => set({ state: null, zip: null, city: null, county: null, source: null }),
    }),
    { name: 'location-store', storage: createJSONStorage(() => AsyncStorage), skipHydration: true }
  )
);
