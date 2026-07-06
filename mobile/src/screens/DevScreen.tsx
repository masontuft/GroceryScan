import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Share,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useProductStore } from '../stores/productStore';
import { useBasketStore } from '../stores/basketStore';
import { useLocationStore } from '../stores/locationStore';
import { analyticsEnvironment } from '../services/analytics';

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL as string) ?? '(not set)';

function maskSupabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.hostname.split('.');
    if (parts.length >= 2) {
      const id = parts[0];
      parts[0] = id.length > 4 ? id.substring(0, 4) + '***' : id.substring(0, 2) + '***';
      return `${parsed.protocol}//${parts.join('.')}`;
    }
    return url.substring(0, 20) + '***';
  } catch {
    return url.substring(0, 20) + '***';
  }
}

interface CacheStats {
  count: number;
  oldest: number | null;
  newest: number | null;
}

export function DevScreen() {
  const cache = useProductStore((s) => s.cache);
  const clearCache = useProductStore((s) => s.clearCache);
  const clearBasket = useBasketStore((s) => s.clearBasket);
  const clearLocation = useLocationStore((s) => s.clear);

  const [stats, setStats] = useState<CacheStats>({ count: 0, oldest: null, newest: null });

  useEffect(() => {
    const entries = Object.values(cache);
    if (entries.length === 0) {
      setStats({ count: 0, oldest: null, newest: null });
    } else {
      const timestamps = entries.map((e) => e.resolvedAt);
      setStats({
        count: entries.length,
        oldest: Math.min(...timestamps),
        newest: Math.max(...timestamps),
      });
    }
  }, [cache]);

  function handleClearProductCache() {
    Alert.alert(
      'Clear Product Cache',
      `Remove ${stats.count} cached product(s)? Next scan will fetch fresh data from the server.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearCache();
            Alert.alert('Done', 'Product cache cleared.');
          },
        },
      ],
    );
  }

  function handleClearBasket() {
    Alert.alert(
      'Clear Basket',
      'Remove all items from your basket?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearBasket();
          },
        },
      ],
    );
  }

  function handleClearLocation() {
    Alert.alert(
      'Clear Location',
      'Remove saved location data?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearLocation },
      ],
    );
  }

  function handleClearAllStorage() {
    Alert.alert(
      'Clear All App Data',
      'This resets ALL app data including store selection and location. The app will need to be set up again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            Alert.alert('Done', 'All app data cleared. Please restart the app.');
          },
        },
      ],
    );
  }

  async function handleShareDeviceInfo() {
    const info = [
      `App Version: ${Constants.expoConfig?.version ?? '—'}`,
      `Expo SDK: ${Constants.expoConfig?.sdkVersion ?? '—'}`,
      `Platform: ${Platform.OS}`,
      `OS Version: ${String(Platform.Version)}`,
      `Supabase URL: ${SUPABASE_URL}`,
    ].join('\n');
    try {
      await Share.share({ message: info });
    } catch {
      Alert.alert('Error', 'Could not share device info.');
    }
  }

  function fmt(ts: number | null): string {
    if (ts === null) return '—';
    return new Date(ts).toLocaleString();
  }

  const appVersion = Constants.expoConfig?.version ?? '—';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Developer Settings</Text>
      <Text style={styles.pageSubtitle}>Internal tools — not for end users.</Text>

      <SectionHeader title="Cache Stats" />
      <View style={styles.card}>
        <StatRow label="Cached products" value={String(stats.count)} />
        <StatRow label="Oldest entry" value={fmt(stats.oldest)} />
        <StatRow label="Newest entry" value={fmt(stats.newest)} />
      </View>
      <ActionButton label="Clear Product Cache" onPress={handleClearProductCache} />
      <Text style={styles.hint}>
        To force-refresh a single scan without clearing all cache, the scan flow accepts{' '}
        <Text style={styles.code}>forceRefresh=true</Text> in{' '}
        <Text style={styles.code}>resolveProduct</Text>.
      </Text>

      <SectionHeader title="Data" />
      <ActionButton label="Clear Basket" onPress={handleClearBasket} destructive />
      <ActionButton label="Clear Location" onPress={handleClearLocation} destructive />
      <ActionButton label="Clear All AsyncStorage" onPress={handleClearAllStorage} destructive />

      <SectionHeader title="Environment" />
      <View style={styles.card}>
        <StatRow label="App version" value={appVersion} />
        <StatRow label="Expo SDK" value={Constants.expoConfig?.sdkVersion ?? '—'} />
        <StatRow label="Platform" value={`${Platform.OS} ${Platform.Version}`} />
        <StatRow label="Supabase URL" value={maskSupabaseUrl(SUPABASE_URL)} />
        <StatRow label="Analytics environment" value={analyticsEnvironment} />
      </View>
      <ActionButton label="Share Device Info" onPress={handleShareDeviceInfo} />

      <View style={styles.spacer} />
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, destructive ? styles.buttonDestructive : styles.buttonPrimary]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.buttonText, destructive ? styles.buttonTextDestructive : styles.buttonTextPrimary]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  statLabel: {
    fontSize: 14,
    color: '#64748b',
    flex: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    flex: 2,
    textAlign: 'right',
  },
  button: {
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonPrimary: {
    backgroundColor: '#2563eb',
  },
  buttonDestructive: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  buttonTextPrimary: {
    color: '#fff',
  },
  buttonTextDestructive: {
    color: '#dc2626',
  },
  hint: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 4,
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
  },
  spacer: {
    height: 40,
  },
});
