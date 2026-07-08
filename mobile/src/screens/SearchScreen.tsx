import React, { useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { searchProducts } from '../services/api';
import { track, trackError } from '../services/analytics';
import { useStoreStore } from '../stores/storeStore';
import { useLocationStore } from '../stores/locationStore';
import { useProductStore } from '../stores/productStore';
import type { Product } from '../types/product';
import type { SearchStackParamList } from '../app/index';

type Props = {
  navigation: NativeStackNavigationProp<SearchStackParamList, 'Search'>;
};

export function SearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // Ref, not state — a rapid double-tap (or Enter + tap) both read `loading`
  // before the first setLoading(true) has re-rendered, so a state-based guard
  // lets two searchProducts calls race and their results/loading updates
  // interleave unpredictably (the reported flicker/blank-screen behavior).
  const searchInFlight = useRef(false);

  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const locationState = useLocationStore((s) => s.state);
  const locationZip = useLocationStore((s) => s.zip);
  const resolveProduct = useProductStore((s) => s.resolveProduct);

  const handleSearch = async () => {
    if (!query.trim() || searchInFlight.current) return;
    searchInFlight.current = true;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchProducts(query.trim(), selectedStoreId);
      setResults(res);
      track('product_searched', { query: query.trim(), resultCount: res.length, storeId: selectedStoreId });
    } catch (err) {
      setResults([]);
      trackError('SearchScreen:handleSearch', err, { query: query.trim() });
      track('product_searched', { query: query.trim(), resultCount: 0, storeId: selectedStoreId });
    } finally {
      searchInFlight.current = false;
      setLoading(false);
    }
  };

  const handleSelect = async (product: Product) => {
    if (resolvingId) return; // already resolving a tap — ignore rapid re-taps
    const barcode = product.upc ?? product.ean ?? product.barcode ?? product.gtin;
    if (!barcode) return;
    track('search_result_selected', { productId: product.id, productName: product.name, storeId: selectedStoreId });
    setResolvingId(product.id);
    try {
      const scanResult = await resolveProduct(barcode, selectedStoreId, { state: locationState, zip: locationZip });
      navigation.navigate('ProductDetail', { scanResult, barcode });
    } catch (err) {
      // Previously fully silent — tapping a search result did nothing with no
      // feedback at all. A search result failing to resolve is unusual (it came
      // from our own DB), so it's always worth tracking, not just business misses.
      trackError('SearchScreen:handleSelect', err, { productId: product.id, barcode });
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search products by name or brand…"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          autoFocus
        />
        <TouchableOpacity
          style={styles.btn}
          onPress={handleSearch}
          disabled={loading}
          accessibilityLabel="Search products"
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>Search</Text>
        </TouchableOpacity>
      </View>
      {loading && <ActivityIndicator style={{ marginTop: 24 }} />}
      {!loading && searched && results.length === 0 && (
        <Text style={styles.empty}>No products found for "{query}"</Text>
      )}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.result, styles.resultRow]}
            onPress={() => handleSelect(item)}
            disabled={resolvingId !== null}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName}>{item.name}</Text>
              {item.brand && <Text style={styles.resultBrand}>{item.brand}</Text>}
              {item.size && <Text style={styles.resultSize}>{item.size} {item.unit}</Text>}
            </View>
            {resolvingId === item.id && <ActivityIndicator size="small" />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBar: { flexDirection: 'row', padding: 16, gap: 10, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  input: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, height: 44, fontSize: 15 },
  btn: { backgroundColor: '#2563eb', paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, color: '#94a3b8', fontSize: 15 },
  result: { padding: 16, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  resultName: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  resultBrand: { fontSize: 13, color: '#64748b', marginTop: 2 },
  resultSize: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
});
