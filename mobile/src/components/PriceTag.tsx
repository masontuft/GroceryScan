import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { AppAlert } from './AppAlert';
import { formatCurrency } from '../utils/formatCurrency';
import { freshnessColor } from '../utils/freshness';
import { parsePriceInput, isPriceOverCap, isPriceEntered } from '../utils/priceValidation';
import type { FreshnessLabel } from '../types/pricing';

interface Props {
  price: number | null;
  regularPrice?: number | null;
  isOnSale?: boolean;
  freshnessLabel: FreshnessLabel;
  /** True when this price should be flagged as potentially outdated (see isPriceStale). */
  isStale?: boolean;
  /** Called with the parsed dollar amount when the user saves an edit. */
  onSave?: (newPrice: number) => Promise<void> | void;
}

export function PriceTag({ price, regularPrice, isOnSale, freshnessLabel, isStale, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    if (!onSave) return;
    setDraft(price !== null ? price.toFixed(2) : '');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft('');
  };

  const commitSave = async (parsed: number) => {
    setSaving(true);
    try {
      await onSave?.(parsed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const parsed = parsePriceInput(draft);
    if (!isPriceEntered(parsed)) return;
    if (isPriceOverCap(parsed)) {
      AppAlert.alert(
        'Confirm price',
        `$${parsed.toFixed(2)} is unusually high for a grocery item. Save it anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save anyway', onPress: () => commitSave(parsed) },
        ]
      );
      return;
    }
    commitSave(parsed);
  };

  if (editing) {
    return (
      <View style={styles.container}>
        <View style={styles.editRow}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.editInput}
            keyboardType="decimal-pad"
            value={draft}
            onChangeText={setDraft}
            placeholder="0.00"
            placeholderTextColor="#94a3b8"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
        </View>
        <View style={styles.editActions}>
          <TouchableOpacity style={styles.editBtnCancel} onPress={cancelEditing} disabled={saving}>
            <Text style={styles.editBtnCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtnSave} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.editBtnSaveText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.priceRow}
        onPress={startEditing}
        disabled={!onSave}
        activeOpacity={onSave ? 0.6 : 1}
      >
        {price !== null ? (
          <>
            <Text style={[styles.price, isOnSale && styles.salePrice]}>
              {formatCurrency(price)}
            </Text>
            {isOnSale && regularPrice !== null && (
              <Text style={styles.regularPrice}>{formatCurrency(regularPrice!)}</Text>
            )}
          </>
        ) : (
          <Text style={styles.noPrice}>Price unavailable</Text>
        )}
        {onSave && <Text style={styles.editIcon}>✎</Text>}
      </TouchableOpacity>
      <View style={[styles.badge, { backgroundColor: freshnessColor(freshnessLabel) }]}>
        <Text style={styles.badgeText}>{freshnessLabel}</Text>
      </View>
      {isStale && (
        <Text style={styles.staleWarning}>This price may be outdated — tap to update it</Text>
      )}
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
  editIcon: { fontSize: 16, color: '#94a3b8', marginLeft: 2 },
  staleWarning: { fontSize: 12, color: '#f59e0b', fontWeight: '600' },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 10,
    minWidth: 140,
  },
  dollarSign: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginRight: 2 },
  editInput: { flex: 1, fontSize: 22, fontWeight: '700', color: '#1e293b' },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editBtnCancel: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  editBtnCancelText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  editBtnSave: { backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, minWidth: 64, alignItems: 'center' },
  editBtnSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
