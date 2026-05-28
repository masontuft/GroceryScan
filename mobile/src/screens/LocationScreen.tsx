import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLocationStore } from '../stores/locationStore';
import type { RootStackParamList } from '../app/index';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Location'>;
};

export function LocationScreen({ navigation }: Props) {
  const { state, zip, source, setFromGPS, setManual } = useLocationStore();
  const [stateInput, setStateInput] = useState(state ?? '');
  const [zipInput, setZipInput] = useState(zip ?? '');
  const [gpsLoading, setGpsLoading] = useState(false);

  const handleGPS = async () => {
    setGpsLoading(true);
    await setFromGPS();
    setGpsLoading(false);
    navigation.goBack();
  };

  const handleManual = () => {
    const s = stateInput.toUpperCase().trim();
    if (!US_STATES.includes(s)) return;
    setManual(s, zipInput.trim());
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Location</Text>
      {state && (
        <View style={styles.current}>
          <Text style={styles.currentLabel}>Current: {state}{zip ? ` ${zip}` : ''} ({source})</Text>
        </View>
      )}
      <TouchableOpacity style={styles.gpsBtn} onPress={handleGPS} disabled={gpsLoading}>
        {gpsLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.gpsBtnText}>Use My Location (GPS)</Text>}
      </TouchableOpacity>
      <Text style={styles.orLabel}>— or enter manually —</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { width: 80 }]}
          placeholder="State"
          value={stateInput}
          onChangeText={(v) => setStateInput(v.toUpperCase())}
          maxLength={2}
          autoCapitalize="characters"
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="ZIP Code"
          value={zipInput}
          onChangeText={setZipInput}
          keyboardType="number-pad"
          maxLength={5}
        />
      </View>
      <TouchableOpacity style={styles.saveBtn} onPress={handleManual}>
        <Text style={styles.saveBtnText}>Save</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  current: { backgroundColor: '#eff6ff', padding: 12, borderRadius: 8 },
  currentLabel: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  gpsBtn: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  gpsBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  orLabel: { textAlign: 'center', color: '#94a3b8', fontSize: 14 },
  row: { flexDirection: 'row', gap: 10 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, height: 48, fontSize: 16 },
  saveBtn: { backgroundColor: '#1e293b', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
