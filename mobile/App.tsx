import 'react-native-gesture-handler';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/app/index';
import { isSupabaseConfigured } from './src/services/api';

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Configuration Error</Text>
        <Text style={styles.message}>
          EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are missing from this
          build. Register them as EAS environment variables for this build profile
          (eas env:create) and rebuild.
        </Text>
      </View>
    );
  }

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A383F',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 20,
  },
});
