import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraView as CameraViewType } from 'expo-camera';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useProductStore, ProductNotFoundError } from '../stores/productStore';
import { useBasketStore } from '../stores/basketStore';
import { useStoreStore } from '../stores/storeStore';
import { useLocationStore } from '../stores/locationStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { ErrorMessages } from '../utils/errorMessages';
import { ocrPriceTag, submitManualEntry } from '../services/api';
import { QuickAddSheet } from '../components/QuickAddSheet';
import type { QuickAddData } from '../components/QuickAddSheet';
import { findStorePrice, isManualPriceStale } from '../utils/freshness';
import { track, trackError } from '../services/analytics';
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
  const [quickAdd, setQuickAdd] = useState<QuickAddData | null>(null);
  const lastScanned = useRef<string | null>(null);
  const cameraRef = useRef<CameraViewType>(null);

  const resolveProduct = useProductStore((s) => s.resolveProduct);
  const addItem = useBasketStore((s) => s.addItem);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const stores = useStoreStore((s) => s.stores);
  const locationState = useLocationStore((s) => s.state);
  const locationZip = useLocationStore((s) => s.zip);
  const { isConnected } = useNetworkStatus();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isWinco = isWincoStore(stores, selectedStoreId);
  const isFocused = useIsFocused();

  useFocusEffect(useCallback(() => {
    lastScanned.current = null;
    setScanning(false);
    setQuickAdd(null);
  }, []));

  const handleBarcode = async (barcode: string) => {
    if (lastScanned.current === barcode || loading) return;
    lastScanned.current = barcode;
    setLoading(true);
    try {
      const result = await resolveProduct(barcode, selectedStoreId, { state: locationState, zip: locationZip });
      track('barcode_scanned', { barcode, found: true, storeId: selectedStoreId });
      if (isWinco) {
        // Show inline quick-add sheet — product identity populated from resolve result
        const manualRow = findStorePrice(result.pricing, selectedStoreId);
        setQuickAdd({
          barcode,
          productName: result.product.name,
          brand: result.product.brand,
          categories: result.product.categories,
          productId: result.product.id,
          imageUrl: result.product.imageUrl,
          existingPrice: manualRow
            ? {
                price: manualRow.salePrice ?? manualRow.regularPrice ?? 0,
                sourceTimestamp: manualRow.sourceTimestamp,
                stale: isManualPriceStale(manualRow.sourceTimestamp),
              }
            : null,
        });
      } else {
        navigation.navigate('ProductDetail', { scanResult: result, barcode });
      }
    } catch (err) {
      track('barcode_scanned', { barcode, found: false, storeId: selectedStoreId });
      if (isWinco) {
        // Show sheet even if lookup failed — user can type name + scan tag for price
        setQuickAdd({
          barcode,
          productName: null,
          brand: null,
          categories: [],
          productId: null,
          imageUrl: null,
        });
      } else if (err instanceof ProductNotFoundError && err.suggestions.length > 0) {
        const buttons = [
          ...err.suggestions.slice(0, 3).map((s) => ({
            text: s.name,
            onPress: async () => {
              try {
                const result = await resolveProduct(s.upc ?? s.barcode ?? s.id, selectedStoreId, { state: locationState, zip: locationZip });
                navigation.navigate('ProductDetail', { scanResult: result, barcode });
              } catch (err) {
                trackError('ScanScreen:didYouMeanResolve', err, { barcode, suggestedProductId: s.id });
              }
            },
          })),
          {
            text: 'Enter Manually',
            style: 'cancel' as const,
            onPress: () => rootNav.navigate('ManualPrice', {
              productId: barcode, productName: `Item (${barcode})`, imageUrl: null,
              productNameEditable: true, productIdIsBarcode: true,
            }),
          },
        ];
        Alert.alert('Did you mean?', "We couldn't find that exact barcode. Is this what you're scanning?", buttons);
      } else {
        Alert.alert(
          'Barcode Not Found',
          `Scanned: ${barcode}\n\nPoint the camera at the shelf price label to read the price automatically, or enter it manually.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Enter Manually',
              onPress: () => rootNav.navigate('ManualPrice', {
                productId: barcode, productName: `Item (${barcode})`, imageUrl: null,
                productNameEditable: true, productIdIsBarcode: true,
              }),
            },
            { text: 'Scan Price Tag', onPress: () => handleScanPriceTag(barcode) },
          ]
        );
      }
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

      // Step 1: OCR the price tag.
      // The Vision response may include an extractedUpc parsed from shelf-label
      // text like "G 17077-10932" (Winco format), which is more reliable than
      // trying to scan the shelf barcode directly (often an internal item code).
      const ocr = await ocrPriceTag(photo.base64).catch((err) => {
        trackError('ScanScreen:ocrPriceTag', err, { barcode });
        return { price: null, productName: null, rawText: '', extractedUpc: null };
      });

      // Step 2: Look up the product using the best available identifier.
      // Prefer extractedUpc from the label text; fall back to the original barcode.
      const lookupBarcode = ocr.extractedUpc ?? barcode;
      const scanResult = await resolveProduct(lookupBarcode, selectedStoreId, {
        state: locationState, zip: locationZip,
      }).catch((err) => {
        if (!(err instanceof ProductNotFoundError)) trackError('ScanScreen:resolveAfterOcr', err, { lookupBarcode });
        return null;
      });

      track('price_tag_scanned', {
        success: Boolean(ocr.price !== null),
        hasExtractedUpc: Boolean(ocr.extractedUpc),
        storeId: selectedStoreId,
      });

      // Prefer database product name/brand/categories over Vision text.
      rootNav.navigate('ManualPrice', {
        productId: scanResult?.product.id ?? lookupBarcode,
        productName: scanResult?.product.name ?? ocr.productName ?? `Item (${barcode})`,
        imageUrl: scanResult?.product.imageUrl ?? null,
        productNameEditable: !scanResult?.product.name,
        productIdIsBarcode: !scanResult?.product.id,
        // The raw code the camera read off the item itself — may differ from
        // lookupBarcode when it was reconstructed from OCR'd shelf-tag text.
        // Kept so a future direct re-scan of this same item still resolves.
        rawBarcode: !scanResult?.product.id ? barcode : undefined,
        initialPrice: ocr.price ?? undefined,
        initialBrand: scanResult?.product.brand ?? undefined,
        initialSize: scanResult?.product.size ?? undefined,
        initialUnit: scanResult?.product.unit ?? undefined,
        initialCategories: scanResult?.product.categories?.length
          ? scanResult.product.categories
          : undefined,
      });
    } catch (err) {
      trackError('ScanScreen:handleScanPriceTag', err, { barcode });
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

  // OCR callback used by QuickAddSheet — captures a photo, returns Vision result,
  // and upgrades product info via extracted UPC if the sheet has no resolved product yet.
  const handleQuickAddScanTag = async () => {
    if (!cameraRef.current) throw new Error('No camera');
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
    if (!photo?.base64) throw new Error('No image captured');
    const ocr = await ocrPriceTag(photo.base64);
    // If we have an extracted UPC and the sheet hasn't resolved a product yet,
    // do a silent lookup and upgrade the sheet's data.
    if (ocr.extractedUpc && quickAdd && !quickAdd.productId) {
      const upgraded = await resolveProduct(ocr.extractedUpc, selectedStoreId, {
        state: locationState, zip: locationZip,
      }).catch((err) => {
        if (!(err instanceof ProductNotFoundError)) trackError('ScanScreen:quickAddUpgrade', err, { extractedUpc: ocr.extractedUpc });
        return null;
      });
      if (upgraded) {
        setQuickAdd((prev) => prev ? {
          ...prev,
          productName: upgraded.product.name,
          brand: upgraded.product.brand,
          categories: upgraded.product.categories,
          productId: upgraded.product.id,
          imageUrl: upgraded.product.imageUrl,
        } : prev);
      }
    }
    return ocr;
  };

  const handleQuickAddItem = ({
    productId,
    name,
    price,
    category,
    taxable,
    imageUrl,
  }: {
    productId: string | null;
    name: string;
    price: number;
    category: string;
    taxable: boolean;
    imageUrl: string | null;
  }) => {
    addItem({
      productId: productId ?? `winco-${Date.now()}`,
      name,
      quantity: 1,
      unitPrice: price,
      appliedDiscount: 0,
      taxable,
      notes: null,
      imageUrl,
      category,
    });

    // Persist the price into store_pricing so it's shared/refreshed like every
    // other chain's pricing, instead of only living in this device's basket.
    if (selectedStoreId && quickAdd) {
      submitManualEntry({
        barcode: productId ? undefined : quickAdd.barcode,
        productName: productId ? undefined : name,
        existingProductId: productId,
        price,
        storeId: selectedStoreId,
        categories: [category],
      }).catch((err) => {
        // The basket item is already added locally, so don't block the flow —
        // but a failed persist means the price won't be shared/refreshed for
        // this store, so surface it loudly instead of swallowing it.
        trackError('ScanScreen:persistWincoPrice', err, { storeId: selectedStoreId, productId });
      });
    }

    setQuickAdd(null);
    lastScanned.current = null;
  };

  const handleQuickAddDismiss = () => {
    setQuickAdd(null);
    lastScanned.current = null;
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
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128'] }}
          onBarcodeScanned={scanning || ocrLoading || quickAdd !== null ? undefined : ({ data }) => {
            setScanning(true);
            handleBarcode(data).finally(() => setTimeout(() => setScanning(false), 2000));
          }}
        >
          <View style={styles.overlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.hint}>Point at a barcode to scan</Text>
          </View>
        </CameraView>
      )}
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

      {/* Quick-add sheet for Winco scans */}
      {quickAdd && (
        <>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={handleQuickAddDismiss}
            accessibilityLabel="Dismiss"
          />
          <QuickAddSheet
            {...quickAdd}
            onScanTag={handleQuickAddScanTag}
            onAdd={handleQuickAddItem}
            onDismiss={handleQuickAddDismiss}
          />
        </>
      )}
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
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
});
