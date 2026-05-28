import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Promotion } from '../types/promotion';

const typeColors: Record<string, string> = {
  bogo: '#7c3aed',
  markdown: '#dc2626',
  digital_coupon: '#2563eb',
  member: '#0891b2',
};

interface Props {
  promotion: Promotion;
}

export function PromotionBadge({ promotion }: Props) {
  const color = typeColors[promotion.type] ?? '#64748b';
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.text}>{promotion.description ?? promotion.type.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
