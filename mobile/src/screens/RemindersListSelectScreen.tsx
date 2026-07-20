import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBasketStore } from '../stores/basketStore';
import { AppAlert } from '../components/AppAlert';
import { getReminderLists, syncBasketToReminders, type ReminderList } from '../services/reminders';
import { track, trackError } from '../services/analytics';
import type { RootStackParamList } from '../app/index';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'RemindersListSelect'>;
};

export function RemindersListSelectScreen({ navigation }: Props) {
  const [lists, setLists] = useState<ReminderList[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const items = useBasketStore((s) => s.items);
  const remindersListId = useBasketStore((s) => s.remindersListId);
  const setRemindersListId = useBasketStore((s) => s.setRemindersListId);

  useEffect(() => {
    getReminderLists()
      .then(setLists)
      .catch((err) => trackError('remindersListSelect:load', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (list: ReminderList) => {
    setSyncing(true);
    try {
      await syncBasketToReminders(list.id, items);
      setRemindersListId(list.id);
      track('basket_synced_to_reminders', { listId: list.id, itemCount: items.length });
      navigation.goBack();
    } catch (err) {
      trackError('remindersListSelect:sync', err, { listId: list.id });
      AppAlert.alert('Sync failed', "Couldn't sync your basket to Reminders. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose a Reminders List</Text>
      {loading && <ActivityIndicator style={{ marginTop: 24 }} />}
      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, item.id === remindersListId && styles.selected]}
            onPress={() => handleSelect(item)}
            disabled={syncing}
          >
            <Text style={styles.name}>{item.title}</Text>
            {syncing ? (
              <ActivityIndicator />
            ) : (
              item.id === remindersListId && <Text style={styles.check}>✓</Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No Reminders lists found.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', padding: 20, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  selected: { backgroundColor: '#eff6ff' },
  name: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  check: { fontSize: 20, color: '#2563eb', fontWeight: '700' },
  empty: { textAlign: 'center', padding: 40, color: '#94a3b8' },
});
