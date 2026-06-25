import React, { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { formatCurrency } from '../utils/formatCurrency';
import type { BasketItem } from '../types/basket';

interface Props {
  visible: boolean;
  onClose: () => void;
  items: BasketItem[];
}

const CATEGORY_COLORS: Record<string, string> = {
  'Produce':        '#16a34a',
  'Meat & Seafood': '#dc2626',
  'Dairy & Eggs':   '#0284c7',
  'Bakery & Bread': '#d97706',
  'Frozen':         '#7c3aed',
  'Beverages':      '#0891b2',
  'Snacks':         '#db2777',
  'Pantry':         '#b45309',
  'Household':      '#64748b',
  'Personal Care':  '#9333ea',
  'Baby':           '#f472b6',
  'Pet':            '#f59e0b',
  'Health':         '#059669',
  'Other':          '#94a3b8',
};

const FALLBACK_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#84cc16','#f97316','#a855f7','#14b8a6',
];

function getColor(category: string | null, index: number): string {
  const cat = category ?? 'Other';
  return CATEGORY_COLORS[cat] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

interface Slice {
  category: string;
  total: number;
  color: string;
  percentage: number;
}

function buildSlices(items: BasketItem[]): Slice[] {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const cat = item.category ?? 'Other';
    const lineTotal = item.unitPrice * item.quantity - item.appliedDiscount;
    totals[cat] = (totals[cat] ?? 0) + lineTotal;
  }
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  if (grandTotal === 0) return [];

  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([category, total], i) => ({
      category,
      total,
      color: getColor(category, i),
      percentage: (total / grandTotal) * 100,
    }));
}

// Compute SVG arc path for a pie slice
function slicePath(
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number
): string {
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function DonutChart({ slices, size }: { slices: Slice[]; size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.52;

  let cursor = 0;
  const paths = slices.map((slice) => {
    const sweep = (slice.percentage / 100) * 360;
    // Leave a tiny gap between slices
    const start = cursor + 0.5;
    const end = cursor + sweep - 0.5;
    const path = sweep > 1 ? slicePath(cx, cy, outerR, start, end) : null;
    cursor += sweep;
    return { ...slice, path };
  });

  const grandTotal = slices.reduce((s, sl) => s + sl.total, 0);

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {paths.map((s) =>
          s.path ? (
            <Path key={s.category} d={s.path} fill={s.color} />
          ) : null
        )}
        {/* Inner circle for donut hole */}
        <Circle cx={cx} cy={cy} r={innerR} fill="#fff" />
      </Svg>
      {/* Centre label */}
      <View style={[styles.centreLabel, { top: cy - 20, width: innerR * 1.6 }]}>
        <Text style={styles.centreLabelTotal}>{formatCurrency(grandTotal)}</Text>
        <Text style={styles.centreLabelSub}>total</Text>
      </View>
    </View>
  );
}

export function BasketAnalysisModal({ visible, onClose, items }: Props) {
  const slices = useMemo(() => buildSlices(items), [items]);
  const grandTotal = useMemo(
    () => slices.reduce((s, sl) => s + sl.total, 0),
    [slices]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Basket Analysis</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {slices.length === 0 ? (
            <Text style={styles.empty}>No items in basket.</Text>
          ) : (
            <>
              {/* Donut chart */}
              <View style={styles.chartWrapper}>
                <DonutChart slices={slices} size={220} />
              </View>

              {/* Legend / breakdown */}
              <View style={styles.legend}>
                {slices.map((slice) => (
                  <View key={slice.category} style={styles.legendRow}>
                    <View style={[styles.dot, { backgroundColor: slice.color }]} />
                    <Text style={styles.legendCategory} numberOfLines={1}>
                      {slice.category}
                    </Text>
                    <Text style={styles.legendPct}>
                      {slice.percentage.toFixed(1)}%
                    </Text>
                    <Text style={styles.legendAmount}>
                      {formatCurrency(slice.total)}
                    </Text>
                  </View>
                ))}

                {/* Divider + grand total */}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total (pre-tax)</Text>
                  <Text style={styles.totalAmount}>{formatCurrency(grandTotal)}</Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  closeBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  closeBtnText: { fontSize: 16, color: '#2563eb', fontWeight: '600' },

  content: { padding: 20, gap: 24 },

  chartWrapper: { alignItems: 'center', position: 'relative' },
  centreLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreLabelTotal: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  centreLabelSub: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },

  legend: { gap: 2 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    gap: 10,
  },
  dot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  legendCategory: { flex: 1, fontSize: 15, color: '#334155', fontWeight: '500' },
  legendPct: { fontSize: 13, color: '#94a3b8', minWidth: 42, textAlign: 'right' },
  legendAmount: { fontSize: 15, fontWeight: '700', color: '#1e293b', minWidth: 64, textAlign: 'right' },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    marginTop: 4,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#475569' },
  totalAmount: { fontSize: 18, fontWeight: '800', color: '#1e293b' },

  empty: { textAlign: 'center', color: '#94a3b8', fontSize: 15, marginTop: 40 },
});
