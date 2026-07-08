import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStoreStore } from '../stores/storeStore';
import { getCurrentCoords } from '../stores/locationStore';
import type { Store } from '../services/api';
import type { RootStackParamList } from '../app/index';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'StoreSelect'>;
};

export function StoreSelectScreen({ navigation }: Props) {
  const stores = useStoreStore((s) => s.stores);
  const loading = useStoreStore((s) => s.loading);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const fetchStores = useStoreStore((s) => s.fetchStores);
  const selectStore = useStoreStore((s) => s.selectStore);
  const resolveNearbyWalmart = useStoreStore((s) => s.resolveNearbyWalmart);
  const [resolving, setResolving] = useState(false);

  useEffect(() => { fetchStores(); }, []);

  const isWalmartPlaceholder = (item: Store) => item.chain === 'walmart' && item.locationId === null;

  const handleSelect = async (item: Store) => {
    if (isWalmartPlaceholder(item)) {
      setResolving(true);
      const coords = await getCurrentCoords();
      if (!coords) {
        setResolving(false);
        Alert.alert('Location needed', 'Enable location access to find your nearest Walmart.');
        return;
      }
      const resolved = await resolveNearbyWalmart(coords[0], coords[1]);
      setResolving(false);
      if (!resolved) {
        Alert.alert('No Walmart found', 'Could not find a nearby Walmart store. Please try again later.');
        return;
      }
      navigation.goBack();
      return;
    }
    selectStore(item.id);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select a Store</Text>
      {loading && <ActivityIndicator style={{ marginTop: 24 }} />}
      <FlatList
        data={stores}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, item.id === selectedStoreId && styles.selected]}
            onPress={() => handleSelect(item)}
            disabled={resolving}
          >
            <View>
              <Text style={styles.chain}>{item.chain.toUpperCase()}</Text>
              <Text style={styles.name}>{item.name}</Text>
              {item.region && <Text style={styles.region}>{item.region}</Text>}
            </View>
            {isWalmartPlaceholder(item) && resolving ? (
              <ActivityIndicator />
            ) : (
              item.id === selectedStoreId && <Text style={styles.check}>✓</Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No stores available.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', padding: 20, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  selected: { backgroundColor: '#eff6ff' },
  chain: { fontSize: 11, fontWeight: '700', color: '#2563eb', letterSpacing: 0.5 },
  name: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginTop: 2 },
  region: { fontSize: 13, color: '#64748b', marginTop: 1 },
  check: { fontSize: 20, color: '#2563eb', fontWeight: '700' },
  empty: { textAlign: 'center', padding: 40, color: '#94a3b8' },
});
