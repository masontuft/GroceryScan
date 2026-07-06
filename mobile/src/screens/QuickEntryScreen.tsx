import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  Keyboard,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useBasketStore } from '../stores/basketStore';
import { useStoreStore } from '../stores/storeStore';
import { normalizeCategory, isTaxExempt, STANDARD_CATEGORIES } from '../utils/normalizeCategory';
import { track } from '../services/analytics';
import { formatCurrency } from '../utils/formatCurrency';

interface SessionEntry {
  key: string;
  name: string;
  price: number;
  category: string | null;
}

export function QuickEntryScreen() {
  const [name, setName] = useState('');
  const [priceText, setPriceText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Other');
  const [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([]);

  const priceInputRef = useRef<TextInput>(null);
  const nameInputRef = useRef<TextInput>(null);

  const addItem = useBasketStore((s) => s.addItem);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const stores = useStoreStore((s) => s.stores);

  const storeName = stores.find((s) => s.id === selectedStoreId)?.name;

  const parsedPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));
  const priceValid = !isNaN(parsedPrice) && parsedPrice > 0;
  const nameValid = name.trim().length > 0;
  const canAdd = priceValid && nameValid;

  const handleAdd = () => {
    if (!canAdd) return;
    const trimmedName = name.trim();
    const category = selectedCategory === 'Other'
      ? normalizeCategory(trimmedName)  // try to infer from name as last resort
      : selectedCategory;
    const productId = `quick-${Date.now()}`;

    addItem({
      productId,
      name: trimmedName,
      quantity: 1,
      unitPrice: parsedPrice,
      appliedDiscount: 0,
      taxable: !isTaxExempt(category),
      notes: null,
      imageUrl: null,
      category,
    });

    setSessionEntries((prev) => [
      { key: productId, name: trimmedName, price: parsedPrice, category },
      ...prev,
    ]);

    track('quick_entry_item_added', { category, storeId: selectedStoreId, price: parsedPrice });

    // Reset for next item — keep category selected for rapid same-category entry
    setName('');
    setPriceText('');
    nameInputRef.current?.focus();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>

        {/* ── Store context ── */}
        {storeName && (
          <View style={styles.storeBar}>
            <Text style={styles.storeBarText}>🏪 {storeName}</Text>
          </View>
        )}

        {/* ── Entry form ── */}
        <View style={styles.form}>
          <Text style={styles.label}>ITEM NAME</Text>
          <TextInput
            ref={nameInputRef}
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Whole Milk, Bananas…"
            placeholderTextColor="#94a3b8"
            returnKeyType="next"
            onSubmitEditing={() => priceInputRef.current?.focus()}
            autoFocus
          />

          <Text style={[styles.label, { marginTop: 14 }]}>PRICE</Text>
          <View style={styles.priceRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              ref={priceInputRef}
              style={styles.priceInput}
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
          </View>

          <Text style={[styles.label, { marginTop: 14 }]}>CATEGORY</Text>
          <FlatList
            data={STANDARD_CATEGORIES as unknown as string[]}
            keyExtractor={(c) => c}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item: cat }) => (
              <TouchableOpacity
                style={[styles.chip, selectedCategory === cat && styles.chipSelected]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextSelected]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity
            style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!canAdd}
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>Add to Basket</Text>
          </TouchableOpacity>
        </View>

        {/* ── Session list ── */}
        {sessionEntries.length > 0 ? (
          <View style={styles.listWrapper}>
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>Added ({sessionEntries.length})</Text>
              <TouchableOpacity onPress={() => setSessionEntries([])}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={sessionEntries}
              keyExtractor={(e) => e.key}
              renderItem={({ item: entry }) => (
                <View style={styles.entryRow}>
                  <View style={styles.entryInfo}>
                    <Text style={styles.entryName} numberOfLines={1}>{entry.name}</Text>
                    {entry.category && entry.category !== 'Other' && (
                      <Text style={styles.entryCategory}>{entry.category}</Text>
                    )}
                  </View>
                  <Text style={styles.entryPrice}>{formatCurrency(entry.price)}</Text>
                </View>
              )}
            />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyHint}>Items you add will appear here</Text>
          </View>
        )}

      </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#fff' },

  storeBar: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  storeBarText: { fontSize: 13, color: '#475569', fontWeight: '500' },

  form: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 52,
    paddingHorizontal: 12,
    gap: 4,
  },
  dollarSign: { fontSize: 22, fontWeight: '600', color: '#1e293b' },
  priceInput: { flex: 1, fontSize: 28, fontWeight: '700', color: '#1e293b' },

  chipRow: { paddingVertical: 4, gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  chipSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#475569' },
  chipTextSelected: { color: '#2563eb', fontWeight: '700' },

  addBtn: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addBtnDisabled: { backgroundColor: '#93c5fd' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  listWrapper: { flex: 1 },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  listHeaderText: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  clearText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  entryInfo: { flex: 1 },
  entryName: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  entryCategory: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  entryPrice: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginLeft: 12 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyHint: { fontSize: 14, color: '#cbd5e1' },
});
