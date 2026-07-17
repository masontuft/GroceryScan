import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, TextInput, Switch, StyleSheet, FlatList } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { PriceTag } from '../components/PriceTag';
import { PromotionBadge } from '../components/PromotionBadge';
import { NutritionPanel } from '../components/NutritionPanel';
import { AppAlert } from '../components/AppAlert';
import { useBasketStore } from '../stores/basketStore';
import { useStoreStore } from '../stores/storeStore';
import { useLocationStore } from '../stores/locationStore';
import { useProductStore } from '../stores/productStore';
import { selectBestPrice } from '../pricing/selectBestPrice';
import { normalizeCategory, isTaxExempt, isLikelyByWeight } from '../utils/normalizeCategory';
import { isPriceStale } from '../utils/freshness';
import { roundWeight, isWeightEntered } from '../utils/priceValidation';
import { supabase, submitManualEntry } from '../services/api';
import { track, trackError } from '../services/analytics';
import type { Product } from '../types/product';
import type { ScanStackParamList, RootStackParamList } from '../app/index';

type Props = {
  navigation: NativeStackNavigationProp<ScanStackParamList, 'ProductDetail'>;
  route: RouteProp<ScanStackParamList, 'ProductDetail'>;
};

export function ProductDetailScreen({ route }: Props) {
  const { scanResult, barcode } = route.params;
  const { product } = scanResult;
  // Stateful (not destructured straight from scanResult) so a refetch on
  // refocus — e.g. returning from ManualPrice after submitting a price —
  // can actually update what's shown. scanResult is a route param captured
  // at the moment this screen was first opened, so without this the price
  // stayed frozen on "no price" even after a manual entry just saved one.
  const [pricing, setPricing] = useState(scanResult.pricing);
  const [promotions, setPromotions] = useState(scanResult.promotions);
  const computedBest = selectBestPrice(pricing);
  const addItem = useBasketStore((s) => s.addItem);
  const resolveProduct = useProductStore((s) => s.resolveProduct);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const locationState = useLocationStore((s) => s.state);
  const locationZip = useLocationStore((s) => s.zip);
  const category = normalizeCategory(product.categories);

  // Locally overrides the displayed price after an inline edit is saved, so the
  // screen reflects the correction immediately without re-fetching scanResult.
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [byWeight, setByWeight] = useState(isLikelyByWeight(category));
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>('lb');
  const [weightText, setWeightText] = useState('1.00');
  const best = priceOverride !== null
    ? { ...computedBest, price: priceOverride, isOnSale: false, freshnessLabel: 'live' as const }
    : computedBest;
  const stale = priceOverride === null && isPriceStale(computedBest.source, computedBest.freshnessLabel);
  // useNavigation reaches the root navigator so we can open the ManualPrice modal
  // from within the nested ScanStack / SearchStack.
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [brandProducts, setBrandProducts] = useState<Product[]>([]);

  // Skip the refetch on the very first focus — the screen was just navigated
  // to with fresh data, so re-fetching immediately would be redundant.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      // forceRefresh: true — without it this would just return the cached
      // result (product/pricing TTLs are hours long), silently defeating the
      // whole point of refetching after e.g. a manual price submission.
      resolveProduct(barcode, selectedStoreId, { state: locationState, zip: locationZip }, true)
        .then((result) => {
          setPricing(result.pricing);
          setPromotions(result.promotions);
          // A fresh server price supersedes whatever the inline-edit override
          // was tracking, and stops it from masking price changes made
          // elsewhere (e.g. a store-side update) with stale local data.
          setPriceOverride(null);
        })
        .catch((err) => {
          trackError('ProductDetailScreen:refetchOnFocus', err, { productId: product.id, barcode });
        });
    }, [barcode, selectedStoreId, locationState, locationZip, product.id, resolveProduct])
  );

  useEffect(() => {
    track('product_viewed', {
      productId: product.id,
      productName: product.name,
      price: best.price,
      hasPromotion: promotions.length > 0,
      storeId: selectedStoreId,
    });
  }, [product.id]);

  useEffect(() => {
    if (!product.manufacturerPrefix) return;
    supabase
      .from('products')
      .select('id, name, brand, image_url, upc, barcode, ean, gtin, sku, size, unit, categories, manufacturer_prefix')
      .eq('manufacturer_prefix', product.manufacturerPrefix)
      .neq('id', product.id)
      .limit(6)
      .then(({ data, error }) => {
        if (error) {
          trackError('ProductDetailScreen:brandProductsFetch', error, { productId: product.id });
          return;
        }
        if (data) {
          setBrandProducts(data.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            name: row.name as string,
            brand: row.brand as string | null,
            barcode: row.barcode as string | null,
            upc: row.upc as string | null,
            ean: row.ean as string | null,
            gtin: row.gtin as string | null,
            sku: row.sku as string | null,
            size: row.size as string | null,
            unit: row.unit as string | null,
            imageUrl: row.image_url as string | null,
            categories: (row.categories as string[]) ?? [],
            manufacturerPrefix: row.manufacturer_prefix as string | null ?? null,
            nutrition: null, // nutrition only ever arrives via scan-resolve
          })));
        }
      });
  }, [product.id, product.manufacturerPrefix]);

  const handleSavePrice = async (newPrice: number) => {
    const storeId = computedBest.source?.storeId ?? selectedStoreId;
    if (!storeId) {
      AppAlert.alert('No store selected', 'Pick a store from the Basket tab before updating a price.');
      return;
    }
    try {
      await submitManualEntry({ existingProductId: product.id, price: newPrice, storeId });
      setPriceOverride(newPrice);
    } catch (err) {
      trackError('ProductDetailScreen:handleSavePrice', err, { productId: product.id, storeId });
      const message = err instanceof Error ? err.message : String(err);
      AppAlert.alert('Error', `Could not save price: ${message}`);
    }
  };

  const handleAddToBasket = () => {
    if (best.price === null) {
      AppAlert.alert('No price available', 'Cannot add item without a known price.');
      return;
    }
    const weight = roundWeight(parseFloat(weightText.replace(/[^0-9.]/g, '')));
    if (byWeight && !isWeightEntered(weight)) {
      AppAlert.alert('Enter a weight', 'Enter the item’s weight before adding it to the basket.');
      return;
    }
    addItem({
      productId: product.id,
      name: product.name,
      quantity: byWeight ? weight : 1,
      unit: byWeight ? weightUnit : 'each',
      unitPrice: best.price,
      appliedDiscount: 0,
      taxable: !isTaxExempt(category, locationState),
      taxableOverridden: false,
      notes: null,
      imageUrl: product.imageUrl,
      category,
    });
    AppAlert.alert('Added', `${product.name} added to basket.`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {product.imageUrl && (
        <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="contain" />
      )}
      <View style={styles.section}>
        {product.brand && <Text style={styles.brand}>{product.brand}</Text>}
        <Text style={styles.name}>{product.name}</Text>
        {(product.size || product.unit) && (
          <Text style={styles.size}>{[product.size, product.unit].filter(Boolean).join(' ')}</Text>
        )}
      </View>
      <View style={styles.section}>
        <PriceTag
          price={best.price}
          regularPrice={best.regularPrice}
          isOnSale={best.isOnSale}
          freshnessLabel={best.freshnessLabel}
          isStale={stale}
          onSave={best.price !== null ? handleSavePrice : undefined}
        />
        {best.price === null && (
          <TouchableOpacity
            style={styles.manualPriceBtn}
            onPress={() =>
              rootNav.navigate('ManualPrice', {
                productId: product.id,
                productName: product.name,
                imageUrl: product.imageUrl ?? null,
                initialBrand: product.brand ?? undefined,
                initialSize: product.size ?? undefined,
                initialUnit: product.unit ?? undefined,
                initialCategories: product.categories?.length ? product.categories : undefined,
                initialByWeight: byWeight,
                initialWeightUnit: weightUnit,
              })
            }
            activeOpacity={0.8}
          >
            <Text style={styles.manualPriceBtnText}>Enter price manually →</Text>
          </TouchableOpacity>
        )}
        {best.price !== null && (
          <>
            <View style={styles.byWeightRow}>
              <Text style={styles.byWeightLabel}>PRICED BY WEIGHT</Text>
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
                  selectTextOnFocus
                />
                {(['lb', 'kg'] as const).map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.chip, weightUnit === u && styles.chipSelected]}
                    onPress={() => setWeightUnit(u)}
                    hitSlop={{ top: 9, bottom: 9 }}
                    accessibilityLabel={u}
                    accessibilityRole="button"
                    accessibilityState={{ selected: weightUnit === u }}
                  >
                    <Text style={[styles.chipText, weightUnit === u && styles.chipTextSelected]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </View>
      {promotions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promotions</Text>
          <View style={styles.promos}>
            {promotions.map((p) => <PromotionBadge key={p.id} promotion={p} />)}
          </View>
        </View>
      )}
      {best.source && (
        <Text style={styles.source}>
          Pricing from {best.source.source} · {new Date(best.source.sourceTimestamp).toLocaleString()}
        </Text>
      )}
      <NutritionPanel nutrition={product.nutrition} />
      {brandProducts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More from this brand</Text>
          <FlatList
            horizontal
            data={brandProducts}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.brandScroll}
            renderItem={({ item: p }) => (
              <View style={styles.brandCard}>
                {p.imageUrl
                  ? <Image source={{ uri: p.imageUrl }} style={styles.brandCardImage} resizeMode="contain" />
                  : <View style={[styles.brandCardImage, styles.brandCardImagePlaceholder]} />
                }
                <Text style={styles.brandCardName} numberOfLines={2}>{p.name}</Text>
              </View>
            )}
          />
        </View>
      )}
      <TouchableOpacity style={styles.addBtn} onPress={handleAddToBasket}>
        <Text style={styles.addBtnText}>Add to Basket</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, gap: 20 },
  image: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#f1f5f9' },
  section: { gap: 6 },
  brand: { fontSize: 13, color: '#64748b', textTransform: 'uppercase', fontWeight: '600', letterSpacing: 0.5 },
  name: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  size: { fontSize: 14, color: '#64748b' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  promos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  source: { fontSize: 12, color: '#94a3b8' },
  addBtn: { backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  manualPriceBtn: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 10,
    alignItems: 'center',
  },
  manualPriceBtnText: { color: '#2563eb', fontWeight: '600', fontSize: 15 },
  byWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  byWeightLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.5 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  weightInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    backgroundColor: '#fff',
  },
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
  brandScroll: { gap: 10, paddingVertical: 4 },
  brandCard: { width: 100, gap: 6 },
  brandCardImage: { width: 100, height: 80, borderRadius: 8, backgroundColor: '#f1f5f9' },
  brandCardImagePlaceholder: { backgroundColor: '#e2e8f0' },
  brandCardName: { fontSize: 11, color: '#334155', textAlign: 'center' },
});
