import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useBasketStore } from '../stores/basketStore';
import { useStoreStore } from '../stores/storeStore';
import { useLocationStore } from '../stores/locationStore';
import { AppAlert } from '../components/AppAlert';
import { submitManualEntry } from '../services/api';
import { track, trackError } from '../services/analytics';
import { normalizeCategory, isTaxExempt, isLikelyByWeight, STANDARD_CATEGORIES, type GroceryCategory } from '../utils/normalizeCategory';
import { parsePriceInput, isPriceOverCap, isPriceEntered, roundWeight, isWeightEntered, MAX_REASONABLE_PRICE } from '../utils/priceValidation';
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
    rawBarcode,
    initialPrice,
    initialBrand,
    initialSize,
    initialUnit,
    initialCategories,
    initialByWeight,
    initialWeightUnit,
  } = route.params;

  const stores = useStoreStore((s) => s.stores);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const selectStore = useStoreStore((s) => s.selectStore);
  const fetchStores = useStoreStore((s) => s.fetchStores);
  const addItem = useBasketStore((s) => s.addItem);
  const locationState = useLocationStore((s) => s.state);

  // Required
  const [productName, setProductName] = useState(initialProductName);
  const [priceText, setPriceText] = useState(initialPrice != null ? initialPrice.toFixed(2) : '');
  const [pickedStoreId, setPickedStoreId] = useState<string>(selectedStoreId ?? OTHER_STORE_ID);
  const [customStoreName, setCustomStoreName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Optional product details — pre-filled when available from product lookup
  const [brand, setBrand] = useState(initialBrand ?? '');
  const [size, setSize] = useState(initialSize ?? '');
  const [unit, setUnit] = useState(initialUnit ?? '');
  // Map the raw lookup categories (e.g. "Food, Beverages & Tobacco > ... > Yogurt")
  // onto one of the predetermined STANDARD_CATEGORIES so tax + display are consistent.
  const [selectedCategory, setSelectedCategory] = useState<GroceryCategory>(
    normalizeCategory(initialCategories && initialCategories.length > 0 ? initialCategories : null)
  );
  // Prefer whatever ProductDetail already had the toggle set to — falling
  // back to the category heuristic only when this screen is reached without
  // that context (e.g. straight from a "not found" barcode scan).
  const [byWeight, setByWeight] = useState(initialByWeight ?? isLikelyByWeight(selectedCategory));
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>(initialWeightUnit ?? 'lb');
  const [weightText, setWeightText] = useState('1.00');

  useEffect(() => {
    if (stores.length === 0) fetchStores();
  }, []);

  const parsedPrice = parsePriceInput(priceText);
  const priceTooHigh = isPriceOverCap(parsedPrice);
  const isOther = pickedStoreId === OTHER_STORE_ID;
  const nameValid = productName.trim().length > 0;
  const weight = roundWeight(parseFloat(weightText.replace(/[^0-9.]/g, '')));
  const canAdd = nameValid && isPriceEntered(parsedPrice) && (!isOther || customStoreName.trim().length > 0)
    && (!byWeight || isWeightEntered(weight)) && !submitting;

  const commitAdd = async () => {
    setSubmitting(true);

    try {
      const result = await submitManualEntry({
        barcode: productIdIsBarcode ? productId : undefined,
        rawBarcode: productIdIsBarcode ? rawBarcode : undefined,
        productName: productIdIsBarcode ? productName.trim() : undefined,
        existingProductId: productIdIsBarcode ? null : productId,
        price: parsedPrice,
        storeId: isOther ? null : pickedStoreId,
        customStoreName: isOther ? customStoreName.trim() : null,
        brand: brand.trim() || null,
        size: size.trim() || null,
        unit: unit.trim() || null,
        categories: [selectedCategory],
      });

      track('manual_price_submitted', {
        category: selectedCategory,
        storeId: isOther ? result.storeId : pickedStoreId,
        isNewStore: isOther,
        price: parsedPrice,
      });

      if (isOther && result.storeId) {
        selectStore(result.storeId);
        fetchStores();
      } else if (!isOther) {
        selectStore(pickedStoreId);
      }

      addItem({
        productId: result.productId,
        name: productName.trim(),
        quantity: byWeight ? weight : 1,
        unit: byWeight ? weightUnit : 'each',
        unitPrice: parsedPrice,
        appliedDiscount: 0,
        taxable: !isTaxExempt(selectedCategory, locationState),
        taxableOverridden: false,
        notes: null,
        imageUrl: imageUrl ?? null,
        category: selectedCategory,
      });

      // Navigate directly rather than gating this on an AppAlert dismissal —
      // this screen is itself a native `presentation: 'modal'` stack screen,
      // and stacking AppAlert's own Modal on top of it just to defer the same
      // goBack() the alert's only button would trigger is the pattern that
      // caused the freeze this fixed (two competing native modal transitions
      // on the same screen). LocationScreen/StoreSelectScreen call goBack()
      // directly for the same "save and return" case — matches that.
      navigation.goBack();
    } catch (err) {
      trackError('ManualPriceScreen:handleAdd', err, { productId, storeId: isOther ? null : pickedStoreId });
      const message = err instanceof Error ? err.message : String(err);
      AppAlert.alert('Error', `Could not save item: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdd = () => {
    if (!canAdd) return;
    if (priceTooHigh) {
      AppAlert.alert(
        'Confirm price',
        `$${parsedPrice.toFixed(2)} is unusually high for a grocery item. Add it anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add anyway', onPress: () => commitAdd() },
        ]
      );
      return;
    }
    commitAdd();
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
          <Text style={styles.label}>ITEM NAME</Text>
          <TextInput
            style={styles.input}
            value={productName}
            onChangeText={setProductName}
            placeholder="e.g. Great Value Whole Milk"
            placeholderTextColor="#94a3b8"
            returnKeyType="next"
            selectTextOnFocus
          />
        </View>

        {/* ── Price (required) ── */}
        <View style={styles.section}>
          <Text style={styles.label}>
            {byWeight ? `PRICE PER ${weightUnit.toUpperCase()}` : 'PRICE'} <Text style={styles.required}>*</Text>
          </Text>
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
          {priceTooHigh && (
            <Text style={styles.warning}>That's over ${MAX_REASONABLE_PRICE} — check the decimal point</Text>
          )}

          <View style={styles.byWeightRow}>
            <Text style={styles.label}>PRICED BY WEIGHT</Text>
            <Switch
              value={byWeight}
              onValueChange={setByWeight}
              trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
              thumbColor={byWeight ? '#2563eb' : '#94a3b8'}
            />
          </View>
          {byWeight && (
            <View style={styles.weightRow}>
              <TextInput
                style={styles.weightInput}
                value={weightText}
                onChangeText={setWeightText}
                keyboardType="decimal-pad"
                placeholder="1.00"
                placeholderTextColor="#94a3b8"
                returnKeyType="done"
              />
              {(['lb', 'kg'] as const).map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.chip, weightUnit === u && styles.chipSelected]}
                  onPress={() => setWeightUnit(u)}
                >
                  <Text style={[styles.chipText, weightUnit === u && styles.chipTextSelected]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Category — always shown; pre-selected from the normalized lookup category ── */}
        <View style={styles.section}>
          <Text style={styles.label}>CATEGORY</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {STANDARD_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, selectedCategory === cat && styles.chipSelected]}
                onPress={() => {
                  setSelectedCategory(cat);
                  setByWeight(isLikelyByWeight(cat));
                }}
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
        </View>

        {/* ── Optional details — always show so pre-filled values from product lookup are visible ── */}
        {(productNameEditable || brand || size || unit) && (
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
            </View>
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
      {submitting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Saving…</Text>
        </View>
      )}
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
  warning: { fontSize: 12, color: '#f59e0b', fontWeight: '600', marginTop: 2 },

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

  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    fontSize: 13,
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
    height: 48,
    paddingHorizontal: 12,
  },
  dollarSign: { fontSize: 20, fontWeight: '600', color: '#1e293b', marginRight: 4 },
  priceInput: { flex: 1, fontSize: 24, fontWeight: '700', color: '#1e293b' },

  byWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  weightInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },

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
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#fff', fontSize: 16 },
});
