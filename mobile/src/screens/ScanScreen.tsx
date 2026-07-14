import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraView as CameraViewType } from 'expo-camera';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useProductStore, ProductNotFoundError } from '../stores/productStore';
import { useStoreStore } from '../stores/storeStore';
import { useLocationStore } from '../stores/locationStore';
import { AppAlert } from '../components/AppAlert';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { ErrorMessages } from '../utils/errorMessages';
import { ocrPriceTag } from '../services/api';
import { selectBestPrice } from '../pricing/selectBestPrice';
import { track, trackError } from '../services/analytics';
import type { ScanStackParamList, RootStackParamList } from '../app/index';

// expo-camera's takePictureAsync occasionally throws "Failed to capture image" on Android
// even after the camera reports ready — a brief, one-time retry clears it in practice.
// skipProcessing on the retry avoids re-triggering whatever native post-processing step failed.
async function captureWithRetry(camera: CameraViewType, options: { base64: boolean; quality: number }) {
  try {
    return { photo: await camera.takePictureAsync(options), attempts: 1 };
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { photo: await camera.takePictureAsync({ ...options, skipProcessing: true }), attempts: 2 };
  }
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
  // CameraView unmounts/remounts on every focus change (see the `isFocused &&`
  // guard below), spinning up a fresh native camera session each time. A ref
  // (not state) is enough here — nothing renders off this, and a plain ref
  // avoids an extra re-render on every readiness flip.
  const cameraReadyRef = useRef(false);
  // Lets the stable onBarcodeScanned callback below read current suppress/handler
  // state without itself being recreated — see the comment at its declaration.
  const suppressScanRef = useRef(false);
  const handleBarcodeRef = useRef<(barcode: string) => Promise<void>>(async () => {});

  const resolveProduct = useProductStore((s) => s.resolveProduct);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const locationState = useLocationStore((s) => s.state);
  const locationZip = useLocationStore((s) => s.zip);
  const { isConnected } = useNetworkStatus();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();

  useFocusEffect(useCallback(() => {
    lastScanned.current = null;
    setScanning(false);
    cameraReadyRef.current = false;
    // CameraView remounts on every focus gain — a readiness flag from the
    // previous mount must not survive into the next one.
    return () => { cameraReadyRef.current = false; };
  }, []));

  // Expo's docs warn explicitly: calling takePictureAsync before onCameraReady,
  // or while the preview is paused, throws on Android (iOS just degrades to
  // the last on-screen frame instead). CameraView here remounts on every
  // focus change, so a capture attempted shortly after regaining focus can
  // hit the native session before it's actually warmed up — this is what
  // produced the "Failed to capture image" exceptions. Poll briefly rather
  // than failing instantly, since readiness is usually just milliseconds away.
  const waitForCameraReady = async (maxWaitMs = 3000): Promise<boolean> => {
    const start = Date.now();
    while (!cameraReadyRef.current) {
      if (Date.now() - start > maxWaitMs) return false;
      await new Promise((r) => setTimeout(r, 100));
    }
    return true;
  };

  // Sends a resolved product straight to the price-entry screen it needs —
  // ProductDetail if a price already exists (any provider, or a prior manual
  // entry), ManualPrice otherwise. Price-driven rather than chain-based, so
  // it applies uniformly to any store/scan that comes back without a price.
  const routeToPriceScreen = (result: Awaited<ReturnType<typeof resolveProduct>>, barcode: string) => {
    const hasPrice = selectBestPrice(result.pricing).price !== null;
    if (hasPrice) {
      navigation.navigate('ProductDetail', { scanResult: result, barcode });
    } else {
      rootNav.navigate('ManualPrice', {
        productId: result.product.id,
        productName: result.product.name,
        imageUrl: result.product.imageUrl,
        initialBrand: result.product.brand ?? undefined,
        initialSize: result.product.size ?? undefined,
        initialUnit: result.product.unit ?? undefined,
        initialCategories: result.product.categories?.length ? result.product.categories : undefined,
      });
    }
  };

  const handleBarcode = async (barcode: string) => {
    if (lastScanned.current === barcode || loading) return;
    lastScanned.current = barcode;
    setLoading(true);
    try {
      const result = await resolveProduct(barcode, selectedStoreId, { state: locationState, zip: locationZip });
      track('barcode_scanned', { barcode, found: true, storeId: selectedStoreId });
      routeToPriceScreen(result, barcode);
    } catch (err) {
      track('barcode_scanned', {
        barcode,
        found: false,
        storeId: selectedStoreId,
        failureReason: err instanceof ProductNotFoundError ? err.reason : 'network_error',
        status: err instanceof ProductNotFoundError ? err.status : null,
      });
      if (err instanceof ProductNotFoundError && err.suggestions.length > 0) {
        const buttons = [
          ...err.suggestions.slice(0, 3).map((s) => ({
            text: s.name,
            onPress: async () => {
              try {
                const result = await resolveProduct(s.upc ?? s.barcode ?? s.id, selectedStoreId, { state: locationState, zip: locationZip });
                routeToPriceScreen(result, barcode);
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
        AppAlert.alert('Did you mean?', "We couldn't find that exact barcode. Is this what you're scanning?", buttons);
      } else {
        AppAlert.alert(
          "Couldn't identify this item",
          'Scan the price tag to capture its price, or enter it manually.',
          [
            { text: 'Scan Price Tag', onPress: () => handleScanPriceTag(barcode) },
            {
              text: 'Enter Manually',
              onPress: () => rootNav.navigate('ManualPrice', {
                productId: barcode, productName: `Item (${barcode})`, imageUrl: null,
                productNameEditable: true, productIdIsBarcode: true,
              }),
            },
          ]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Kept up to date every render so the stable onBarcodeScanned callback below
  // never has to be recreated (and never has to become `undefined`) just because
  // scanning/ocrLoading changed — see that callback's comment.
  handleBarcodeRef.current = handleBarcode;
  suppressScanRef.current = scanning || ocrLoading;

  // CameraView previously received `undefined` in place of this callback while
  // suppressed, which on Android forces a native camera reconfiguration — and that
  // reconfiguration racing with an in-flight takePictureAsync() call is what produced
  // the "Failed to capture image" exceptions. Passing a callback with a stable identity
  // (never undefined, never recreated) avoids that churn; gating happens internally
  // via suppressScanRef instead of by swapping the prop.
  const onBarcodeScanned = useCallback(({ data }: { data: string }) => {
    if (suppressScanRef.current) return;
    setScanning(true);
    handleBarcodeRef.current(data).finally(() => setTimeout(() => setScanning(false), 2000));
  }, []);

  const handleScanPriceTag = async (barcode: string) => {
    if (!cameraRef.current) return;
    const camera = cameraRef.current;
    setOcrLoading(true);
    let captureAttempts = 0;
    try {
      if (!(await waitForCameraReady())) throw new Error('Camera not ready');
      const { photo, attempts } = await captureWithRetry(camera, { base64: true, quality: 0.6 });
      captureAttempts = attempts;
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
        failureReason: ocr.price === null ? 'ocr_failed' : null,
        hasExtractedUpc: Boolean(ocr.extractedUpc),
        storeId: selectedStoreId,
        captureAttempts,
        flow: 'not_found_fallback',
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
      trackError('ScanScreen:handleScanPriceTag', err, { barcode, captureAttempts, cameraReady: cameraReadyRef.current });
      track('price_tag_scanned', { success: false, failureReason: 'capture_failed', storeId: selectedStoreId, captureAttempts });
      // The two failure-prone steps inside the try (OCR, product lookup) both
      // catch inline and never rethrow — anything reaching here is a camera
      // capture failure. Previously this silently dropped the user onto a
      // manual-entry form with a placeholder name and no explanation, which
      // read as broken rather than as a fallback.
      AppAlert.alert(
        "Couldn't Read Price Tag",
        "We weren't able to capture a photo of the price tag. Please enter the details manually."
      );
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
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128'] }}
          onCameraReady={() => { cameraReadyRef.current = true; }}
          onBarcodeScanned={onBarcodeScanned}
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
});
