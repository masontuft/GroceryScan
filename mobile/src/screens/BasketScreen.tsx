import React, { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBasketStore } from '../stores/basketStore';
import { useLocationStore } from '../stores/locationStore';
import { BasketItemRow } from '../components/BasketItemRow';
import { TotalBreakdown } from '../components/TotalBreakdown';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useLocalTotal } from '../hooks/useLocalTotal';
import { ErrorMessages } from '../utils/errorMessages';
import type { RootStackParamList } from '../app/index';

export function BasketScreen() {
  const items = useBasketStore((s) => s.items);
  const lastTotal = useBasketStore((s) => s.lastTotal);
  const loading = useBasketStore((s) => s.loading);
  const clearBasket = useBasketStore((s) => s.clearBasket);
  const removeItem = useBasketStore((s) => s.removeItem);
  const updateQuantity = useBasketStore((s) => s.updateQuantity);
  const recalculate = useBasketStore((s) => s.recalculate);
  const locationState = useLocationStore((s) => s.state);
  const locationCity = useLocationStore((s) => s.city);
  const locationZip = useLocationStore((s) => s.zip);
  const { isConnected } = useNetworkStatus();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Local total is always computed — used when the backend hasn't responded yet
  // or when recalculate() fails (e.g. custom/offline stores).
  const localTotal = useLocalTotal(items, locationState, locationCity);

  // Prefer the backend total (includes promotions & server-side tax); fall back
  // to the locally-computed one so the breakdown is never blank.
  const displayTotal = lastTotal ?? localTotal;

  useEffect(() => {
    if (isConnected && items.length > 0) recalculate();
  }, [isConnected]);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🛒</Text>
        <Text style={styles.emptyText}>Your basket is empty.</Text>
        <Text style={styles.emptyHint}>Scan items to add them here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>{ErrorMessages.OFFLINE}</Text>
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => item.productId}
        renderItem={({ item }) => (
          <BasketItemRow item={item} onRemove={removeItem} onQuantityChange={updateQuantity} />
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            {/* Location pill — tap to open LocationScreen */}
            <TouchableOpacity
              style={styles.locationRow}
              onPress={() => rootNav.navigate('Location')}
              activeOpacity={0.7}
            >
              <Text style={styles.locationIcon}>📍</Text>
              {locationState ? (
                <Text style={styles.locationSet}>
                  {locationState}{locationZip ? ` ${locationZip}` : ''} · tap to change
                </Text>
              ) : (
                <Text style={styles.locationUnset}>Set location for tax estimate</Text>
              )}
            </TouchableOpacity>

            <TotalBreakdown total={displayTotal} isEstimate={!lastTotal} />
            {loading && (
              <ActivityIndicator size="small" style={styles.recalcSpinner} />
            )}
            <TouchableOpacity style={styles.clearBtn} onPress={clearBasket}>
              <Text style={styles.clearText}>Clear Basket</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#334155' },
  emptyHint: { fontSize: 14, color: '#94a3b8' },
  footer: { padding: 16, gap: 12 },
  recalcSpinner: { alignSelf: 'center' },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  locationIcon: { fontSize: 14 },
  locationSet: { fontSize: 13, color: '#475569', fontWeight: '500' },
  locationUnset: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  clearBtn: { paddingVertical: 12, alignItems: 'center' },
  clearText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
  offlineBanner: { backgroundColor: '#f59e0b', padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
