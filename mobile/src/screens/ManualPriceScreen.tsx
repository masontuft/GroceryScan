import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useBasketStore } from '../stores/basketStore';
import { useStoreStore } from '../stores/storeStore';
import { submitManualEntry } from '../services/api';
import { normalizeCategory, isTaxExempt } from '../utils/normalizeCategory';
import type { RootStackParamList } from '../app/index';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ManualPrice'>;
  route: RouteProp<RootStackParamList, 'ManualPrice'>;
};

const OTHER_STORE_ID = '__other__';

export function ManualPriceScreen({ navigation, route }: Props) {
  const {
    productId,
    productName: initialProductName,
    imageUrl,
    productNameEditable = false,
    productIdIsBarcode = false,
    initialPrice,
  } = route.params;

  const stores = useStoreStore((s) => s.stores);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const selectStore = useStoreStore((s) => s.selectStore);
  const fetchStores = useStoreStore((s) => s.fetchStores);
  const addItem = useBasketStore((s) => s.addItem);

  // Required
  const [productName, setProductName] = useState(initialProductName);
  const [priceText, setPriceText] = useState(initialPrice != null ? initialPrice.toFixed(2) : '');
  const [pickedStoreId, setPickedStoreId] = useState<string>(selectedStoreId ?? OTHER_STORE_ID);
  const [customStoreName, setCustomStoreName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Optional product details
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState('');
  const [categoriesText, setCategoriesText] = useState('');  // comma-separated

  useEffect(() => {
    if (stores.length === 0) fetchStores();
  }, []);

  const parsedPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));
  const priceValid = !isNaN(parsedPrice) && parsedPrice > 0;
  const isOther = pickedStoreId === OTHER_STORE_ID;
  const nameValid = productName.trim().length > 0;
  const canAdd = priceValid && nameValid && (!isOther || customStoreName.trim().length > 0) && !submitting;

  const handleAdd = async () => {
    if (!canAdd) return;
    setSubmitting(true);

    const categories = categoriesText
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    try {
      const result = await submitManualEntry({
        barcode: productIdIsBarcode ? productId : undefined,
        productName: productIdIsBarcode ? productName.trim() : undefined,
        existingProductId: productIdIsBarcode ? null : productId,
        price: parsedPrice,
        storeId: isOther ? null : pickedStoreId,
        customStoreName: isOther ? customStoreName.trim() : null,
        brand: brand.trim() || null,
        size: size.trim() || null,
        unit: unit.trim() || null,
        categories: categories.length > 0 ? categories : null,
      });

      if (isOther && result.storeId) {
        selectStore(result.storeId);
        fetchStores();
      } else if (!isOther) {
        selectStore(pickedStoreId);
      }

      const category = normalizeCategory(categories[0]);
      addItem({
        productId: result.productId,
        name: productName.trim(),
        quantity: 1,
        unitPrice: parsedPrice,
        appliedDiscount: 0,
        taxable: !isTaxExempt(category),
        notes: null,
        imageUrl: imageUrl ?? null,
        category: category !== 'Other' ? category : (categories[0] ?? null),
      });

      Alert.alert('Added', `${productName.trim()} added to basket.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert('Error', `Could not save item: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const storeRows = [
    ...stores,
    { id: OTHER_STORE_ID, name: 'Other / not listed', chain: '', region: '' },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Product name ── */}
        <View style={styles.section}>
          <Text style={styles.label}>ITEM NAME{productNameEditable ? '' : ''}</Text>
          {productNameEditable ? (
            <TextInput
              style={styles.input}
              value={productName}
              onChangeText={setProductName}
              placeholder="e.g. Great Value Whole Milk"
              placeholderTextColor="#94a3b8"
              returnKeyType="next"
              selectTextOnFocus
            />
          ) : (
            <Text style={styles.productName}>{productName}</Text>
          )}
        </View>

        {/* ── Price (required) ── */}
        <View style={styles.section}>
          <Text style={styles.label}>PRICE <Text style={styles.required}>*</Text></Text>
          <View style={styles.priceRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.priceInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              value={priceText}
              onChangeText={setPriceText}
              returnKeyType="done"
              autoFocus={!productNameEditable}
            />
          </View>
        </View>

        {/* ── Optional details ── */}
        {productNameEditable && (
          <View style={styles.section}>
            <Text style={styles.label}>OPTIONAL DETAILS</Text>
            <View style={styles.optionalGrid}>
              <View style={styles.optionalHalf}>
                <Text style={styles.sublabel}>Brand</Text>
                <TextInput
                  style={styles.input}
                  value={brand}
                  onChangeText={setBrand}
                  placeholder="e.g. Great Value"
                  placeholderTextColor="#94a3b8"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.optionalHalf}>
                <Text style={styles.sublabel}>Size</Text>
                <TextInput
                  style={styles.input}
                  value={size}
                  onChangeText={setSize}
                  placeholder="e.g. 32"
                  placeholderTextColor="#94a3b8"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.optionalHalf}>
                <Text style={styles.sublabel}>Unit</Text>
                <TextInput
                  style={styles.input}
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="e.g. oz, lb, ct"
                  placeholderTextColor="#94a3b8"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.optionalHalf}>
                <Text style={styles.sublabel}>Categories</Text>
                <TextInput
                  style={styles.input}
                  value={categoriesText}
                  onChangeText={setCategoriesText}
                  placeholder="dairy, milk"
                  placeholderTextColor="#94a3b8"
                  returnKeyType="done"
                  autoCapitalize="none"
                />
              </View>
            </View>
            <Text style={styles.hint}>Separate categories with commas</Text>
          </View>
        )}

        {/* ── Store picker ── */}
        <View style={styles.section}>
          <Text style={styles.label}>STORE</Text>
          <FlatList
            data={storeRows}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const selected = item.id === pickedStoreId;
              return (
                <TouchableOpacity
                  style={[styles.storeRow, selected && styles.storeRowSelected]}
                  onPress={() => setPickedStoreId(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.storeRowInner}>
                    {item.chain ? (
                      <Text style={styles.storeChain}>{item.chain.toUpperCase()}</Text>
                    ) : null}
                    <Text style={[styles.storeName, selected && styles.storeNameSelected]}>
                      {item.name}
                    </Text>
                  </View>
                  {selected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />

          {isOther && (
            <TextInput
              style={styles.input}
              placeholder="Enter store name…"
              placeholderTextColor="#94a3b8"
              value={customStoreName}
              onChangeText={setCustomStoreName}
              returnKeyType="done"
            />
          )}
        </View>

        {/* ── Add button ── */}
        <TouchableOpacity
          style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={!canAdd}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.addBtnText}>Add to Basket</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, gap: 24 },

  section: { gap: 8 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  required: { color: '#ef4444' },
  sublabel: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 4 },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  productName: { fontSize: 18, fontWeight: '700', color: '#1e293b' },

  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#1e293b',
  },

  optionalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionalHalf: { width: '47%' },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
  },
  dollarSign: { fontSize: 20, fontWeight: '600', color: '#1e293b', marginRight: 4 },
  priceInput: { flex: 1, fontSize: 24, fontWeight: '700', color: '#1e293b' },

  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#f8fafc',
  },
  storeRowSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  storeRowInner: { flex: 1 },
  storeChain: { fontSize: 11, fontWeight: '700', color: '#2563eb', letterSpacing: 0.5 },
  storeName: { fontSize: 15, fontWeight: '500', color: '#1e293b', marginTop: 1 },
  storeNameSelected: { fontWeight: '700' },
  checkmark: { fontSize: 16, color: '#2563eb', fontWeight: '700' },

  addBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  addBtnDisabled: { backgroundColor: '#93c5fd' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
});
