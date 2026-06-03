import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { searchProducts } from '../services/api';
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

  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const locationState = useLocationStore((s) => s.state);
  const locationZip = useLocationStore((s) => s.zip);
  const resolveProduct = useProductStore((s) => s.resolveProduct);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchProducts(query.trim(), selectedStoreId);
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (product: Product) => {
    const barcode = product.upc ?? product.ean ?? product.barcode ?? product.gtin;
    if (!barcode) return;
    try {
      const scanResult = await resolveProduct(barcode, selectedStoreId, { state: locationState, zip: locationZip });
      navigation.navigate('ProductDetail', { scanResult, barcode });
    } catch {
      // silently ignore, product detail will show partial data
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
        <TouchableOpacity style={styles.btn} onPress={handleSearch}>
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
          <TouchableOpacity style={styles.result} onPress={() => handleSelect(item)}>
            <Text style={styles.resultName}>{item.name}</Text>
            {item.brand && <Text style={styles.resultBrand}>{item.brand}</Text>}
            {item.size && <Text style={styles.resultSize}>{item.size} {item.unit}</Text>}
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
  resultName: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  resultBrand: { fontSize: 13, color: '#64748b', marginTop: 2 },
  resultSize: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
});
