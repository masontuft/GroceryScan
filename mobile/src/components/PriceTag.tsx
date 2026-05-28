import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatCurrency } from '../utils/formatCurrency';
import { freshnessColor } from '../utils/freshness';
import type { FreshnessLabel } from '../types/pricing';

interface Props {
  price: number | null;
  regularPrice?: number | null;
  isOnSale?: boolean;
  freshnessLabel: FreshnessLabel;
}

export function PriceTag({ price, regularPrice, isOnSale, freshnessLabel }: Props) {
  return (
    <View style={styles.container}>
      {price !== null ? (
        <View style={styles.priceRow}>
          <Text style={[styles.price, isOnSale && styles.salePrice]}>
            {formatCurrency(price)}
          </Text>
          {isOnSale && regularPrice !== null && (
            <Text style={styles.regularPrice}>{formatCurrency(regularPrice!)}</Text>
          )}
        </View>
      ) : (
        <Text style={styles.noPrice}>Price unavailable</Text>
      )}
      <View style={[styles.badge, { backgroundColor: freshnessColor(freshnessLabel) }]}>
        <Text style={styles.badgeText}>{freshnessLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-start', gap: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  price: { fontSize: 28, fontWeight: '700', color: '#1e293b' },
  salePrice: { color: '#dc2626' },
  regularPrice: { fontSize: 16, color: '#94a3b8', textDecorationLine: 'line-through' },
  noPrice: { fontSize: 18, color: '#94a3b8' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'uppercase' },
});
