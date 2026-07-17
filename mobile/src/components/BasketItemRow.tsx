import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { AppAlert } from './AppAlert';
import { formatCurrency } from '../utils/formatCurrency';
import { STANDARD_CATEGORIES } from '../utils/normalizeCategory';
import { parsePriceInput, isPriceOverCap, isPriceEntered, roundWeight, isWeightEntered } from '../utils/priceValidation';
import type { BasketItem } from '../types/basket';

interface Props {
  item: BasketItem;
  onRemove: (productId: string) => void;
  onQuantityChange: (productId: string, qty: number) => void;
  onWeightChange: (productId: string, weight: number, unit: 'lb' | 'kg') => void;
  onUpdate: (productId: string, changes: Partial<Pick<BasketItem, 'name' | 'unitPrice' | 'category' | 'taxable' | 'taxableOverridden' | 'notes'>>) => void;
}

export function BasketItemRow({ item, onRemove, onQuantityChange, onWeightChange, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editPrice, setEditPrice] = useState(String(item.unitPrice));
  const [editCategory, setEditCategory] = useState<string>(item.category ?? 'Other');
  const [editTaxable, setEditTaxable] = useState(item.taxable);
  const [weightText, setWeightText] = useState(String(item.quantity));
  // Tracks whether the user actually moved the TAXABLE switch during this edit
  // session, as opposed to it merely holding item.taxable's initial value.
  // Without this, saving after an unrelated edit (renaming, recategorizing)
  // would stamp taxableOverridden:true just because *some* save happened,
  // permanently freezing a stale taxable value and stopping basket-recalculate
  // from ever recomputing it from category + state again.
  const [taxableTouched, setTaxableTouched] = useState(false);

  useEffect(() => {
    setEditName(item.name);
    setEditPrice(String(item.unitPrice));
    setEditCategory(item.category ?? 'Other');
    setEditTaxable(item.taxable);
    setTaxableTouched(false);
    setWeightText(String(item.quantity));
  }, [item]);

  const lineTotal = item.unitPrice * item.quantity - item.appliedDiscount;

  const commitWeight = () => {
    const weight = roundWeight(parseFloat(weightText.replace(/[^0-9.]/g, '')));
    if (!isWeightEntered(weight)) {
      setWeightText(String(item.quantity));
      return;
    }
    onWeightChange(item.productId, weight, item.unit as 'lb' | 'kg');
  };

  const commitSave = (price: number) => {
    onUpdate(item.productId, {
      name: editName.trim() || item.name,
      unitPrice: isPriceEntered(price) ? price : item.unitPrice,
      category: editCategory,
      taxable: editTaxable,
      // Only mark this an explicit user override if they actually touched the
      // switch this session — otherwise omit the field so a prior override (or
      // lack of one) is left as-is rather than getting frozen/cleared by an
      // unrelated save.
      ...(taxableTouched ? { taxableOverridden: true } : {}),
    });
    setExpanded(false);
  };

  const handleSave = () => {
    const price = parsePriceInput(editPrice);
    if (isPriceOverCap(price)) {
      AppAlert.alert(
        'Confirm price',
        `$${price.toFixed(2)} is unusually high for a grocery item. Save it anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save anyway', onPress: () => commitSave(price) },
        ]
      );
      return;
    }
    commitSave(price);
  };

  const handleDiscard = () => {
    setEditName(item.name);
    setEditPrice(String(item.unitPrice));
    setEditCategory(item.category ?? 'Other');
    setEditTaxable(item.taxable);
    setTaxableTouched(false);
    setExpanded(false);
  };

  return (
    <View style={styles.wrapper}>
      {/* ── Collapsed row ── */}
      <TouchableOpacity
        style={styles.row}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
        accessibilityLabel={`${item.name}, ${formatCurrency(lineTotal)}`}
        accessibilityHint="Double-tap to edit"
        accessibilityRole="button"
      >
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <View style={styles.metaRow}>
            {item.category && (
              <Text style={styles.categoryChip}>{item.category}</Text>
            )}
            <Text style={styles.unitPrice}>
              {item.unit === 'each' ? `${formatCurrency(item.unitPrice)} each` : `${formatCurrency(item.unitPrice)}/${item.unit}`}
            </Text>
          </View>
          {item.appliedDiscount > 0 && (
            <Text style={styles.discount}>−{formatCurrency(item.appliedDiscount)} discount</Text>
          )}
        </View>
        <View style={styles.controls}>
          {item.unit === 'each' ? (
            <>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => onQuantityChange(item.productId, item.quantity - 1)}
                accessibilityLabel={`Decrease quantity of ${item.name}`}
                accessibilityRole="button"
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qty} accessibilityLabel={`Quantity: ${item.quantity}`}>{item.quantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => onQuantityChange(item.productId, item.quantity + 1)}
                accessibilityLabel={`Increase quantity of ${item.name}`}
                accessibilityRole="button"
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.weightEditRow}>
              <TextInput
                style={styles.weightEditInput}
                value={weightText}
                onChangeText={setWeightText}
                onBlur={commitWeight}
                onSubmitEditing={commitWeight}
                keyboardType="decimal-pad"
                selectTextOnFocus
                accessibilityLabel={`Weight of ${item.name}`}
              />
              <Text style={styles.weightUnitLabel}>{item.unit}</Text>
            </View>
          )}
        </View>
        <View style={styles.right}>
          <Text style={styles.total}>{formatCurrency(lineTotal)}</Text>
          <TouchableOpacity
            onPress={() => onRemove(item.productId)}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityLabel={`Remove ${item.name} from basket`}
            accessibilityRole="button"
          >
            <Text style={styles.remove}>✕</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* ── Expanded edit panel ── */}
      {expanded && (
        <View style={styles.editPanel}>
          <Text style={styles.editLabel}>ITEM NAME</Text>
          <TextInput
            style={styles.editInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Item name"
            placeholderTextColor="#94a3b8"
            returnKeyType="next"
            selectTextOnFocus
          />

          <Text style={styles.editLabel}>PRICE</Text>
          <View style={styles.priceRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.priceInput}
              value={editPrice}
              onChangeText={setEditPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              selectTextOnFocus
            />
          </View>

          <Text style={styles.editLabel}>CATEGORY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <View style={styles.chipRow}>
              {STANDARD_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, editCategory === cat && styles.chipSelected]}
                  onPress={() => setEditCategory(cat)}
                  hitSlop={{ top: 9, bottom: 9 }}
                  accessibilityLabel={cat}
                  accessibilityRole="button"
                  accessibilityState={{ selected: editCategory === cat }}
                >
                  <Text style={[styles.chipText, editCategory === cat && styles.chipTextSelected]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={styles.taxRow}>
            <Text style={styles.editLabel}>TAXABLE</Text>
            <Switch
              value={editTaxable}
              onValueChange={(v) => {
                setEditTaxable(v);
                setTaxableTouched(true);
              }}
              trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
              thumbColor={editTaxable ? '#2563eb' : '#94a3b8'}
            />
          </View>

          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.discardBtn}
              onPress={handleDiscard}
              accessibilityLabel="Discard changes"
              accessibilityRole="button"
            >
              <Text style={styles.discardText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSave}
              accessibilityLabel="Save changes"
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderBottomWidth: 1, borderColor: '#e2e8f0' },
  row: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  categoryChip: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unitPrice: { fontSize: 13, color: '#64748b' },
  discount: { fontSize: 12, color: '#16a34a', marginTop: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: '#334155' },
  qty: { fontSize: 16, fontWeight: '600', minWidth: 20, textAlign: 'center' },
  weightEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weightEditInput: {
    width: 60,
    height: 36,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    backgroundColor: '#fff',
    textAlign: 'center',
  },
  weightUnitLabel: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  right: { alignItems: 'flex-end', gap: 4 },
  total: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  remove: { fontSize: 16, color: '#94a3b8' },

  // Edit panel
  editPanel: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
  },
  editLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#1e293b',
    backgroundColor: '#fff',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    gap: 4,
  },
  dollarSign: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  priceInput: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1e293b' },
  chipScroll: { marginTop: 2 },
  chipRow: { flexDirection: 'row', gap: 6, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  chipSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  chipText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  chipTextSelected: { color: '#2563eb', fontWeight: '700' },
  taxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  discardBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  discardText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  saveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  saveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
