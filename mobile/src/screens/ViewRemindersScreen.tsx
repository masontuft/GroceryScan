import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBasketStore } from '../stores/basketStore';
import { getRemindersForList, type SyncedReminder } from '../services/reminders';
import { trackError } from '../services/analytics';

// Read-only reference view of the synced Reminders list's current state —
// does not write back to the basket. Two-way sync (e.g. checking something
// off here removing it from the basket) is explicitly out of scope: iOS
// gives no change-notification for Reminders, so it'd need polling and
// conflict handling this app doesn't have yet.
export function ViewRemindersScreen() {
  const remindersListId = useBasketStore((s) => s.remindersListId);
  const [reminders, setReminders] = useState<SyncedReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh: boolean) => {
    if (!remindersListId) {
      setLoading(false);
      return;
    }
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const result = await getRemindersForList(remindersListId);
      setReminders(result);
    } catch (err) {
      trackError('viewReminders:load', err, { listId: remindersListId });
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, [remindersListId]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  if (!remindersListId) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No Reminders list synced yet.</Text>
        <Text style={styles.emptyHint}>Sync your basket to Reminders first, then check back here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={[styles.checkbox, item.completed && styles.checkboxDone]}>
                {item.completed ? '✓' : '○'}
              </Text>
              <Text style={[styles.title, item.completed && styles.titleDone]}>{item.title}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No reminders on this list.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { marginTop: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#334155', textAlign: 'center' },
  emptyHint: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  checkbox: { fontSize: 18, color: '#cbd5e1', width: 20, textAlign: 'center' },
  checkboxDone: { color: '#16a34a' },
  title: { flex: 1, fontSize: 15, color: '#1e293b' },
  titleDone: { color: '#94a3b8', textDecorationLine: 'line-through' },
});
