import React, { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useBasketStore } from '../stores/basketStore';
import { BasketItemRow } from '../components/BasketItemRow';
import { TotalBreakdown } from '../components/TotalBreakdown';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { ErrorMessages } from '../utils/errorMessages';

export function BasketScreen() {
  const items = useBasketStore((s) => s.items);
  const lastTotal = useBasketStore((s) => s.lastTotal);
  const loading = useBasketStore((s) => s.loading);
  const clearBasket = useBasketStore((s) => s.clearBasket);
  const removeItem = useBasketStore((s) => s.removeItem);
  const updateQuantity = useBasketStore((s) => s.updateQuantity);
  const recalculate = useBasketStore((s) => s.recalculate);
  const { isConnected } = useNetworkStatus();

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
            {loading ? (
              <ActivityIndicator style={{ marginVertical: 16 }} />
            ) : lastTotal ? (
              <TotalBreakdown total={lastTotal} />
            ) : null}
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
  clearBtn: { paddingVertical: 12, alignItems: 'center' },
  clearText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
  offlineBanner: { backgroundColor: '#f59e0b', padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
