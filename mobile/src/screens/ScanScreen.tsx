import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProductStore } from '../stores/productStore';
import { useStoreStore } from '../stores/storeStore';
import { useLocationStore } from '../stores/locationStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { ErrorMessages } from '../utils/errorMessages';
import type { ScanStackParamList } from '../app/index';

type Props = {
  navigation: NativeStackNavigationProp<ScanStackParamList, 'Scan'>;
};

export function ScanScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const lastScanned = useRef<string | null>(null);

  const resolveProduct = useProductStore((s) => s.resolveProduct);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const location = useLocationStore((s) => ({ state: s.state, zip: s.zip }));
  const { isConnected } = useNetworkStatus();

  const handleBarcode = async (barcode: string) => {
    if (lastScanned.current === barcode || loading) return;
    lastScanned.current = barcode;
    setLoading(true);
    try {
      const result = await resolveProduct(barcode, selectedStoreId, location);
      navigation.navigate('ProductDetail', { scanResult: result, barcode });
    } catch {
      Alert.alert('Not Found', ErrorMessages.UNKNOWN_BARCODE);
      lastScanned.current = null;
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    handleBarcode(manualCode.trim());
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator /></View>;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera access is needed to scan barcodes.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
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
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128'] }}
        onBarcodeScanned={scanning ? undefined : ({ data }) => {
          setScanning(true);
          handleBarcode(data).finally(() => setTimeout(() => setScanning(false), 2000));
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.hint}>Point at a barcode to scan</Text>
        </View>
      </CameraView>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Looking up product…</Text>
        </View>
      )}
      <View style={styles.manual}>
        <TextInput
          style={styles.input}
          placeholder="Enter UPC / EAN manually"
          value={manualCode}
          onChangeText={setManualCode}
          keyboardType="number-pad"
          returnKeyType="search"
          onSubmitEditing={handleManualSubmit}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleManualSubmit}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  permText: { fontSize: 16, color: '#334155', textAlign: 'center' },
  btn: { backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  camera: { flex: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  scanFrame: { width: 260, height: 160, borderWidth: 2, borderColor: '#fff', borderRadius: 8 },
  hint: { color: '#fff', fontSize: 15, opacity: 0.85 },
  loadingOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#fff', fontSize: 16 },
  manual: { flexDirection: 'row', padding: 16, gap: 10, backgroundColor: '#fff' },
  input: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, height: 44, fontSize: 15 },
  searchBtn: { backgroundColor: '#2563eb', paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  offlineBanner: { backgroundColor: '#f59e0b', padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
