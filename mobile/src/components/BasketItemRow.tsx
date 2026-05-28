import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatCurrency } from '../utils/formatCurrency';
import type { BasketItem } from '../types/basket';

interface Props {
  item: BasketItem;
  onRemove: (productId: string) => void;
  onQuantityChange: (productId: string, qty: number) => void;
}

export function BasketItemRow({ item, onRemove, onQuantityChange }: Props) {
  const lineTotal = item.unitPrice * item.quantity - item.appliedDiscount;

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.unitPrice}>{formatCurrency(item.unitPrice)} each</Text>
        {item.appliedDiscount > 0 && (
          <Text style={styles.discount}>-{formatCurrency(item.appliedDiscount)} discount</Text>
        )}
      </View>
      <View style={styles.controls}>
        <TouchableOpacity style={styles.qtyBtn} onPress={() => onQuantityChange(item.productId, item.quantity - 1)}>
          <Text style={styles.qtyBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.qty}>{item.quantity}</Text>
        <TouchableOpacity style={styles.qtyBtn} onPress={() => onQuantityChange(item.productId, item.quantity + 1)}>
          <Text style={styles.qtyBtnText}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.right}>
        <Text style={styles.total}>{formatCurrency(lineTotal)}</Text>
        <TouchableOpacity onPress={() => onRemove(item.productId)}>
          <Text style={styles.remove}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderColor: '#e2e8f0', gap: 12, alignItems: 'center' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  unitPrice: { fontSize: 13, color: '#64748b', marginTop: 2 },
  discount: { fontSize: 12, color: '#16a34a', marginTop: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: '#334155' },
  qty: { fontSize: 16, fontWeight: '600', minWidth: 20, textAlign: 'center' },
  right: { alignItems: 'flex-end', gap: 4 },
  total: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  remove: { fontSize: 16, color: '#94a3b8' },
});
