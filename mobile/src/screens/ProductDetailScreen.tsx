import React from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { PriceTag } from '../components/PriceTag';
import { PromotionBadge } from '../components/PromotionBadge';
import { useBasketStore } from '../stores/basketStore';
import { selectBestPrice } from '../pricing/selectBestPrice';
import { normalizeCategory, isTaxExempt } from '../utils/normalizeCategory';
import type { ScanStackParamList, RootStackParamList } from '../app/index';

type Props = {
  navigation: NativeStackNavigationProp<ScanStackParamList, 'ProductDetail'>;
  route: RouteProp<ScanStackParamList, 'ProductDetail'>;
};

export function ProductDetailScreen({ route }: Props) {
  const { scanResult } = route.params;
  const { product, pricing, promotions } = scanResult;
  const best = selectBestPrice(pricing);
  const addItem = useBasketStore((s) => s.addItem);
  // useNavigation reaches the root navigator so we can open the ManualPrice modal
  // from within the nested ScanStack / SearchStack.
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleAddToBasket = () => {
    if (best.price === null) {
      Alert.alert('No price available', 'Cannot add item without a known price.');
      return;
    }
    const category = normalizeCategory(product.categories[0]);
    addItem({
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPrice: best.price,
      appliedDiscount: 0,
      taxable: !isTaxExempt(category),
      notes: null,
      imageUrl: product.imageUrl,
      category,
    });
    Alert.alert('Added', `${product.name} added to basket.`);
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
        />
        {best.price === null && (
          <TouchableOpacity
            style={styles.manualPriceBtn}
            onPress={() =>
              rootNav.navigate('ManualPrice', {
                productId: product.id,
                productName: product.name,
                imageUrl: product.imageUrl ?? null,
              })
            }
            activeOpacity={0.8}
          >
            <Text style={styles.manualPriceBtnText}>Enter price manually →</Text>
          </TouchableOpacity>
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
});
