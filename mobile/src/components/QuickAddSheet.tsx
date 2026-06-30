import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { STANDARD_CATEGORIES, normalizeCategory, isTaxExempt } from '../utils/normalizeCategory';

export interface QuickAddData {
  barcode: string;
  productName: string | null;
  brand: string | null;
  categories: string[];
  productId: string | null;
  imageUrl: string | null;
}

interface Props extends QuickAddData {
  onScanTag: () => Promise<{ price: number | null; productName: string | null }>;
  onAdd: (args: {
    productId: string | null;
    name: string;
    price: number;
    category: string;
    taxable: boolean;
    imageUrl: string | null;
  }) => void;
  onDismiss: () => void;
}

export function QuickAddSheet({
  productName,
  brand,
  categories,
  productId,
  imageUrl,
  onScanTag,
  onAdd,
  onDismiss,
}: Props) {
  const [name, setName] = useState(productName ?? '');
  const [priceText, setPriceText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    normalizeCategory(categories.length > 0 ? categories : null)
  );
  const [tagScanning, setTagScanning] = useState(false);
  const priceRef = useRef<TextInput>(null);

  const parsedPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));
  const priceValid = !isNaN(parsedPrice) && parsedPrice > 0;
  const canAdd = priceValid && name.trim().length > 0;

  const handleScanTag = async () => {
    setTagScanning(true);
    try {
      const result = await onScanTag();
      if (result.price !== null) setPriceText(result.price.toFixed(2));
      if (result.productName && !productName && !name) setName(result.productName);
      setTimeout(() => priceRef.current?.focus(), 100);
    } catch {
      // OCR failed — user types manually
    } finally {
      setTagScanning(false);
    }
  };

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({
      productId,
      name: name.trim(),
      price: parsedPrice,
      category: selectedCategory,
      taxable: !isTaxExempt(selectedCategory),
      imageUrl,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.wrapper}
    >
      <View style={styles.sheet}>
        {/* Drag handle / dismiss tap */}
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.handleRow}
          hitSlop={{ top: 12, bottom: 12 }}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        >
          <View style={styles.handle} />
        </TouchableOpacity>

        {/* Product identity */}
        {productName ? (
          <View style={styles.identity}>
            <Text style={styles.productName} numberOfLines={2}>{productName}</Text>
            {brand ? <Text style={styles.brand}>{brand}</Text> : null}
          </View>
        ) : (
          <View style={styles.identity}>
            <Text style={styles.sectionLabel}>ITEM NAME</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Type item name…"
              placeholderTextColor="#94a3b8"
              returnKeyType="next"
              autoFocus
              onSubmitEditing={() => priceRef.current?.focus()}
              accessibilityLabel="Item name"
            />
          </View>
        )}

        {/* Category chips */}
        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>CATEGORY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {STANDARD_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, selectedCategory === cat && styles.chipSelected]}
              onPress={() => setSelectedCategory(cat)}
              hitSlop={{ top: 10, bottom: 10 }}
              accessibilityLabel={cat}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedCategory === cat }}
            >
              <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextSelected]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Price input + OCR */}
        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>SHELF PRICE</Text>
        <View style={styles.priceRow}>
          <Text style={styles.dollar}>$</Text>
          <TextInput
            ref={priceRef}
            style={styles.priceInput}
            value={priceText}
            onChangeText={setPriceText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#94a3b8"
            returnKeyType="done"
            onSubmitEditing={handleAdd}
            accessibilityLabel="Price"
          />
          <TouchableOpacity
            style={styles.ocrBtn}
            onPress={handleScanTag}
            disabled={tagScanning}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Scan price tag"
            accessibilityRole="button"
          >
            {tagScanning ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Text style={styles.ocrBtnText}>📷 Scan Tag</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Add to basket */}
        <TouchableOpacity
          style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={!canAdd}
          activeOpacity={0.8}
          accessibilityLabel="Add to basket"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAdd }}
        >
          <Text style={styles.addBtnText}>Add to Basket</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 24,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  identity: {
    marginBottom: 4,
  },
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  brand: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  sectionLabel: {
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
    fontSize: 15,
    color: '#1e293b',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 2,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  chipSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  chipTextSelected: {
    color: '#2563eb',
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 54,
    paddingHorizontal: 12,
    gap: 6,
    backgroundColor: '#fff',
  },
  dollar: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1e293b',
  },
  priceInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
  },
  ocrBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    minWidth: 90,
    alignItems: 'center',
  },
  ocrBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  addBtn: {
    marginTop: 14,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#86efac',
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
