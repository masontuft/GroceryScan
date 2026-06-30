import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraView as CameraViewType } from 'expo-camera';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useProductStore, ProductNotFoundError } from '../stores/productStore';
import { useStoreStore } from '../stores/storeStore';
import { useLocationStore } from '../stores/locationStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { ErrorMessages } from '../utils/errorMessages';
import { ocrPriceTag } from '../services/api';
import type { ScanStackParamList, RootStackParamList } from '../app/index';

function isWincoStore(stores: { id: string; chain: string }[], storeId: string | null) {
  if (!storeId) return false;
  return stores.find((s) => s.id === storeId)?.chain?.toLowerCase().includes('winco') ?? false;
}

type Props = {
  navigation: NativeStackNavigationProp<ScanStackParamList, 'Scan'>;
};

export function ScanScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const lastScanned = useRef<string | null>(null);
  const cameraRef = useRef<CameraViewType>(null);

  const resolveProduct = useProductStore((s) => s.resolveProduct);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const stores = useStoreStore((s) => s.stores);
  const locationState = useLocationStore((s) => s.state);
  const locationZip = useLocationStore((s) => s.zip);
  const { isConnected } = useNetworkStatus();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isWinco = isWincoStore(stores, selectedStoreId);
  const isFocused = useIsFocused();

  // Reset scan state every time this screen comes back into focus (e.g. after
  // the ManualPrice modal is dismissed). This prevents the camera from re-firing
  // the same barcode alert in a loop while a modal is open on top.
  useFocusEffect(useCallback(() => {
    lastScanned.current = null;
    setScanning(false);
  }, []));

  const handleBarcode = async (barcode: string) => {
    if (lastScanned.current === barcode || loading) return;
    lastScanned.current = barcode;
    setLoading(true);
    try {
      const result = await resolveProduct(barcode, selectedStoreId, { state: locationState, zip: locationZip });
      if (isWinco) {
        // Winco has no live pricing — go straight to quick entry with the resolved product
        rootNav.navigate('WincoEntry', { initialBarcode: barcode });
      } else {
        navigation.navigate('ProductDetail', { scanResult: result, barcode });
      }
    } catch (err) {
      if (err instanceof ProductNotFoundError && err.suggestions.length > 0) {
        // Fuzzy match found — show "Did you mean?" options before manual entry
        const buttons = [
          ...err.suggestions.slice(0, 3).map((s) => ({
            text: s.name,
            onPress: async () => {
              try {
                const result = await resolveProduct(s.upc ?? s.barcode ?? s.id, selectedStoreId, { state: locationState, zip: locationZip });
                navigation.navigate('ProductDetail', { scanResult: result, barcode });
              } catch {
                // fall through to ProductDetail with no pricing
              }
            },
          })),
          { text: 'Enter Manually', style: 'cancel' as const,
            onPress: () => rootNav.navigate('ManualPrice', {
              productId: barcode, productName: `Item (${barcode})`, imageUrl: null,
              productNameEditable: true, productIdIsBarcode: true,
            }),
          },
        ];
        Alert.alert('Did you mean?', 'We couldn\'t find that exact barcode. Is this what you\'re scanning?', buttons);
      } else {
        // Product identity not found — offer OCR price tag scan or plain manual entry.
        Alert.alert(
          'Barcode Not Found',
          'Point the camera at the shelf price label to read the price automatically, or enter it manually.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Enter Manually',
              onPress: () =>
                rootNav.navigate('ManualPrice', {
                  productId: barcode,
                  productName: `Item (${barcode})`,
                  imageUrl: null,
                  productNameEditable: true,
                  productIdIsBarcode: true,
                }),
            },
            {
              text: 'Scan Price Tag',
              onPress: () => handleScanPriceTag(barcode),
            },
          ]
        );
      }
      // Do NOT reset lastScanned here — keeping it set prevents the camera from
      // re-firing the same barcode alert every 2 seconds while the modal is open.
      // State is cleared by useFocusEffect when this screen regains focus.
    } finally {
      setLoading(false);
    }
  };

  const handleScanPriceTag = async (barcode: string) => {
    if (!cameraRef.current) return;
    setOcrLoading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      if (!photo?.base64) throw new Error('No image captured');
      const result = await ocrPriceTag(photo.base64);
      rootNav.navigate('ManualPrice', {
        productId: barcode,
        productName: result.productName ?? `Item (${barcode})`,
        imageUrl: null,
        productNameEditable: true,
        productIdIsBarcode: true,
        initialPrice: result.price ?? undefined,
      });
    } catch {
      // OCR failed — fall back to blank manual entry
      rootNav.navigate('ManualPrice', {
        productId: barcode,
        productName: `Item (${barcode})`,
        imageUrl: null,
        productNameEditable: true,
        productIdIsBarcode: true,
      });
    } finally {
      setOcrLoading(false);
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
      {isFocused && <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128'] }}
        onBarcodeScanned={scanning || ocrLoading ? undefined : ({ data }) => {
          setScanning(true);
          handleBarcode(data).finally(() => setTimeout(() => setScanning(false), 2000));
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.hint}>Point at a barcode to scan</Text>
        </View>
      </CameraView>}
      {(loading || ocrLoading) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>
            {ocrLoading ? 'Reading price tag…' : 'Looking up product…'}
          </Text>
        </View>
      )}
      {isWinco && (
        <TouchableOpacity
          style={styles.wincoBar}
          onPress={() => rootNav.navigate('WincoEntry', {})}
          activeOpacity={0.8}
        >
          <Text style={styles.wincoBarText}>⚡ Winco Quick Entry — tap to add multiple items fast</Text>
        </TouchableOpacity>
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
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={handleManualSubmit}
          accessibilityLabel="Search by barcode"
          accessibilityRole="button"
        >
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
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#fff', fontSize: 16 },
  manual: { flexDirection: 'row', padding: 16, gap: 10, backgroundColor: '#fff' },
  input: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, height: 44, fontSize: 15 },
  searchBtn: { backgroundColor: '#2563eb', paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  offlineBanner: { backgroundColor: '#f59e0b', padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  wincoBar: { backgroundColor: '#1e40af', paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  wincoBarText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
