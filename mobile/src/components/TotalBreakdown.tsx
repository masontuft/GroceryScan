import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatCurrency } from '../utils/formatCurrency';
import type { BasketTotal } from '../types/basket';

interface Props {
  total: BasketTotal;
  /** True when using locally-computed totals (backend hasn't responded yet) */
  isEstimate?: boolean;
}

export function TotalBreakdown({ total, isEstimate = false }: Props) {
  return (
    <View style={styles.container}>
      {isEstimate && (
        <Text style={styles.estimateNote}>Based on local tax rates</Text>
      )}
      <Row label="Subtotal" value={total.subtotal} />
      {total.discounts > 0 && <Row label="Savings" value={-total.discounts} color="#16a34a" />}
      <Row label="Est. Tax" value={total.tax} note={total.tax === 0 ? 'tax-exempt' : 'estimate'} />
      <View style={styles.divider} />
      <Row label="Est. Total" value={total.estimatedTotal} bold />
    </View>
  );
}

function Row({ label, value, color, bold, note }: { label: string; value: number; color?: string; bold?: boolean; note?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, bold && styles.boldText]}>
        {label}{note ? ` (${note})` : ''}
      </Text>
      <Text style={[styles.value, bold && styles.boldText, color ? { color } : null]}>
        {formatCurrency(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f8fafc', borderRadius: 12, gap: 8 },
  estimateNote: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 15, color: '#64748b' },
  value: { fontSize: 15, color: '#1e293b', fontWeight: '500' },
  boldText: { fontWeight: '700', fontSize: 18, color: '#1e293b' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 4 },
});
