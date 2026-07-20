import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { BasketAnalysisModal } from '../components/BasketAnalysisModal';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppAlert } from '../components/AppAlert';
import { useBasketStore } from '../stores/basketStore';
import { useLocationStore } from '../stores/locationStore';
import { useStoreStore } from '../stores/storeStore';
import { BasketItemRow } from '../components/BasketItemRow';
import { TotalBreakdown } from '../components/TotalBreakdown';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useLocalTotal } from '../hooks/useLocalTotal';
import { ErrorMessages } from '../utils/errorMessages';
import { track, trackError } from '../services/analytics';
import { REMINDERS_SUPPORTED, requestRemindersPermission, syncBasketToReminders, shareBasketAsText } from '../services/reminders';
import type { RootStackParamList } from '../app/index';
import type { BasketItem } from '../types/basket';

const CATEGORY_ORDER = [
  'Produce',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Bakery & Bread',
  'Frozen',
  'Beverages',
  'Snacks',
  'Pantry',
  'Household',
  'Personal Care',
  'Baby',
  'Pet',
  'Health',
  'Other',
];

function groupByCategory(items: BasketItem[]) {
  const groups: Record<string, BasketItem[]> = {};
  for (const item of items) {
    const key = item.category ?? 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return CATEGORY_ORDER
    .filter((cat) => groups[cat])
    .map((cat) => ({ title: cat, data: groups[cat] }))
    .concat(
      Object.keys(groups)
        .filter((k) => !CATEGORY_ORDER.includes(k))
        .map((k) => ({ title: k, data: groups[k] }))
    );
}

export function BasketScreen() {
  const [analysisVisible, setAnalysisVisible] = useState(false);
  const [remindersSyncing, setRemindersSyncing] = useState(false);
  const items = useBasketStore((s) => s.items);
  const lastTotal = useBasketStore((s) => s.lastTotal);
  const loading = useBasketStore((s) => s.loading);
  const recalcError = useBasketStore((s) => s.recalcError);
  const clearBasket = useBasketStore((s) => s.clearBasket);
  const removeItem = useBasketStore((s) => s.removeItem);
  const updateQuantity = useBasketStore((s) => s.updateQuantity);
  const updateWeight = useBasketStore((s) => s.updateWeight);
  const updateItem = useBasketStore((s) => s.updateItem);
  const recalculate = useBasketStore((s) => s.recalculate);
  const remindersListId = useBasketStore((s) => s.remindersListId);
  const locationState = useLocationStore((s) => s.state);
  const locationCity = useLocationStore((s) => s.city);
  const locationZip = useLocationStore((s) => s.zip);
  const { isConnected } = useNetworkStatus();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const stores = useStoreStore((s) => s.stores);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const storeName = stores.find((s) => s.id === selectedStoreId)?.name ?? 'No Store';

  const localTotal = useLocalTotal(items, locationState, locationCity);
  // When the last server recalc failed, lastTotal is stale (may not reflect
  // the current basket contents) — prefer the fresh local estimate instead.
  const displayTotal = recalcError ? localTotal : lastTotal ?? localTotal;

  const sections = useMemo(() => groupByCategory(items), [items]);

  useEffect(() => {
    if (isConnected && items.length > 0) recalculate();
  }, [isConnected, locationState, locationZip]);

  useFocusEffect(
    useCallback(() => {
      if (items.length > 0) {
        track('basket_checkout_viewed', {
          itemCount: items.length,
          estimatedTotal: displayTotal.estimatedTotal,
        });
      }
    }, [items.length, displayTotal.estimatedTotal])
  );

  const handleSyncToReminders = async () => {
    const granted = await requestRemindersPermission();
    if (!granted) {
      AppAlert.alert('Permission needed', 'Allow access to Reminders in Settings to sync your basket.');
      return;
    }
    if (!remindersListId) {
      rootNav.navigate('RemindersListSelect');
      return;
    }
    setRemindersSyncing(true);
    try {
      await syncBasketToReminders(remindersListId, items);
      track('basket_synced_to_reminders', { listId: remindersListId, itemCount: items.length });
    } catch (err) {
      trackError('basketScreen:syncReminders', err, { listId: remindersListId });
      AppAlert.alert('Sync failed', "Couldn't sync your basket to Reminders. Please try again.");
    } finally {
      setRemindersSyncing(false);
    }
  };

  const handleShareBasket = async () => {
    try {
      await shareBasketAsText(items);
      track('basket_shared', { itemCount: items.length });
    } catch (err) {
      trackError('basketScreen:share', err);
    }
  };

  const storeBanner = (
    <TouchableOpacity
      style={styles.storeBanner}
      onPress={() => rootNav.navigate('StoreSelect')}
      activeOpacity={0.7}
    >
      <Text style={styles.storeBannerIcon}>🏪</Text>
      <Text style={styles.storeBannerText}>{storeName}</Text>
      <Text style={styles.storeBannerChange}>Change</Text>
    </TouchableOpacity>
  );

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        {!isConnected && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>{ErrorMessages.OFFLINE}</Text>
          </View>
        )}
        {storeBanner}
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyText}>Your basket is empty.</Text>
          <Text style={styles.emptyHint}>Scan items to add them here.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>{ErrorMessages.OFFLINE}</Text>
        </View>
      )}
      {storeBanner}
      <BasketAnalysisModal
        visible={analysisVisible}
        onClose={() => setAnalysisVisible(false)}
        items={items}
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.productId}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <BasketItemRow
            item={item}
            onRemove={removeItem}
            onQuantityChange={updateQuantity}
            onWeightChange={updateWeight}
            onUpdate={updateItem}
          />
        )}
        stickySectionHeadersEnabled
        ListFooterComponent={
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.locationRow}
              onPress={() => rootNav.navigate('Location')}
              activeOpacity={0.7}
            >
              <Text style={styles.locationIcon}>📍</Text>
              {locationState ? (
                <Text style={styles.locationSet}>
                  {locationState}{locationZip ? ` ${locationZip}` : ''} · tap to change
                </Text>
              ) : (
                <Text style={styles.locationUnset}>Set location for tax estimate</Text>
              )}
            </TouchableOpacity>

            {recalcError && !loading && (
              <View style={styles.recalcErrorBanner}>
                <Text style={styles.recalcErrorText}>Couldn't update totals — showing local estimate</Text>
                <TouchableOpacity onPress={() => recalculate()} accessibilityLabel="Retry updating totals" accessibilityRole="button">
                  <Text style={styles.recalcErrorRetry}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            <TotalBreakdown total={displayTotal} isEstimate={!lastTotal || recalcError} hasLocation={Boolean(locationState)} />
            {loading && (
              <ActivityIndicator size="small" style={styles.recalcSpinner} />
            )}
            <TouchableOpacity
              style={styles.analysisBtn}
              onPress={() => {
                track('basket_analysis_viewed', { itemCount: items.length });
                setAnalysisVisible(true);
              }}
              activeOpacity={0.8}
              accessibilityLabel="View basket analysis"
              accessibilityRole="button"
            >
              <Text style={styles.analysisBtnText}>📊  Basket Analysis</Text>
            </TouchableOpacity>
            {REMINDERS_SUPPORTED && (
              <TouchableOpacity
                style={styles.analysisBtn}
                onPress={handleSyncToReminders}
                activeOpacity={0.8}
                disabled={remindersSyncing}
                accessibilityLabel="Sync basket to Reminders"
                accessibilityRole="button"
              >
                {remindersSyncing ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={styles.analysisBtnText}>✅  Sync to Reminders</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.analysisBtn}
              onPress={handleShareBasket}
              activeOpacity={0.8}
              accessibilityLabel="Share basket list"
              accessibilityRole="button"
            >
              <Text style={styles.analysisBtnText}>📤  Share List</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() =>
                AppAlert.alert(
                  'Clear Basket',
                  'Remove all items from your basket?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', style: 'destructive', onPress: clearBasket },
                  ]
                )
              }
              accessibilityLabel="Clear basket"
              accessibilityRole="button"
            >
              <Text style={styles.clearText}>Clear Basket</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#334155' },
  emptyHint: { fontSize: 14, color: '#94a3b8' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  footer: { padding: 16, gap: 12 },
  recalcSpinner: { alignSelf: 'center' },
  recalcErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  recalcErrorText: { flex: 1, fontSize: 13, color: '#92400e', fontWeight: '500' },
  recalcErrorRetry: { fontSize: 13, color: '#2563eb', fontWeight: '700', marginLeft: 8 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  locationIcon: { fontSize: 14 },
  locationSet: { fontSize: 13, color: '#475569', fontWeight: '500' },
  locationUnset: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  analysisBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  analysisBtnText: { fontSize: 15, fontWeight: '600', color: '#334155' },
  clearBtn: { paddingVertical: 12, alignItems: 'center' },
  clearText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
  offlineBanner: { backgroundColor: '#f59e0b', padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  storeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  storeBannerIcon: { fontSize: 16 },
  storeBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1e293b' },
  storeBannerChange: { fontSize: 12, fontWeight: '700', color: '#2563eb' },
});
