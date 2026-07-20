import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraView as CameraViewType } from 'expo-camera';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useBasketStore } from '../stores/basketStore';
import { useStoreStore } from '../stores/storeStore';
import { AppAlert } from '../components/AppAlert';
import { compareReceipt, confirmReceiptMatch } from '../services/api';
import type { ReceiptComparisonResult, ReceiptComparisonItem } from '../services/api';
import { track, trackError } from '../services/analytics';

// Same capture-retry workaround as ScanScreen's handleScanPriceTag — Android's
// takePictureAsync occasionally throws "Failed to capture image" even after
// onCameraReady fires; a single skipProcessing retry clears it in practice.
async function captureWithRetry(camera: CameraViewType, options: { base64: boolean; quality: number }) {
  try {
    return { photo: await camera.takePictureAsync(options), attempts: 1 };
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { photo: await camera.takePictureAsync({ ...options, skipProcessing: true }), attempts: 2 };
  }
}

export function ReceiptScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraViewType>(null);
  const cameraReadyRef = useRef(false);
  const isFocused = useIsFocused();

  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ReceiptComparisonResult | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const items = useBasketStore((s) => s.items);
  const lastTotal = useBasketStore((s) => s.lastTotal);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);

  useFocusEffect(
    useCallback(() => {
      cameraReadyRef.current = false;
      track('receipt_scan_started', { storeId: selectedStoreId, basketItemCount: items.length });
      return () => { cameraReadyRef.current = false; };
      // Only meant to fire once per focus gain, not on every basket/store change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Same readiness-polling workaround as ScanScreen — CameraView remounts on
  // every focus change and a capture attempted too soon after can throw.
  const waitForCameraReady = async (maxWaitMs = 3000): Promise<boolean> => {
    const start = Date.now();
    while (!cameraReadyRef.current) {
      if (Date.now() - start > maxWaitMs) return false;
      await new Promise((r) => setTimeout(r, 100));
    }
    return true;
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    if (!lastTotal) {
      AppAlert.alert('Totals not ready', 'Waiting for basket totals to finish calculating — try again in a moment.');
      return;
    }
    const camera = cameraRef.current;
    setScanning(true);
    try {
      if (!(await waitForCameraReady())) throw new Error('Camera not ready');
      const { photo } = await captureWithRetry(camera, { base64: true, quality: 0.7 });
      if (!photo?.base64) throw new Error('No image captured');

      const res = await compareReceipt({
        imageBase64: photo.base64,
        storeId: selectedStoreId,
        basketSnapshot: items,
        calculatedTotal: lastTotal,
      });
      setResult(res);
      const unmatchedCount = res.items.filter((i) => i.matchMethod === 'unmatched').length;
      track('receipt_scan_completed', {
        storeId: selectedStoreId,
        itemsMatchedCount: res.items.length - unmatchedCount,
        itemsUnmatchedCount: unmatchedCount,
        totalDelta: res.totals.totalDelta,
      });
    } catch (err) {
      trackError('ReceiptScanScreen:handleCapture', err, { storeId: selectedStoreId });
      AppAlert.alert(
        "Couldn't Read Receipt",
        "We weren't able to read that receipt. Try again with better lighting and make sure the whole receipt is in frame."
      );
    } finally {
      setScanning(false);
    }
  };

  // Basket items already spoken for by a matched (auto or manually-confirmed)
  // receipt line — the remaining ones are candidates for confirming an
  // 'unmatched' line against.
  const matchedProductIds = new Set(
    (result?.items ?? []).filter((i) => i.productId).map((i) => i.productId as string)
  );
  const unresolvedBasketItems = items.filter((i) => !matchedProductIds.has(i.productId));

  const handleConfirm = async (item: ReceiptComparisonItem, productId: string | null) => {
    setConfirmingId(item.id);
    try {
      const updated = await confirmReceiptMatch({ receiptScanItemId: item.id, productId });
      setResult((prev) => prev && {
        ...prev,
        items: prev.items.map((i) => (
          i.id === item.id
            ? {
                ...i,
                productId: updated.productId,
                calculatedPrice: updated.calculatedPrice,
                priceDelta: updated.priceDelta,
                matchMethod: updated.matchMethod as ReceiptComparisonItem['matchMethod'],
              }
            : i
        )),
      });
      track('receipt_scan_confirmed', { receiptScanItemId: item.id, matched: productId !== null });
    } catch (err) {
      trackError('ReceiptScanScreen:handleConfirm', err, { receiptScanItemId: item.id });
      AppAlert.alert('Error', 'Could not save your confirmation. Please try again.');
    } finally {
      setConfirmingId(null);
    }
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator /></View>;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera access is needed to scan your receipt.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (result) {
    const { totals } = result;
    const unmatched = result.items.filter((i) => i.matchMethod === 'unmatched');
    const resolved = result.items.filter((i) => i.matchMethod !== 'unmatched');

    return (
      <ScrollView style={styles.resultContainer} contentContainerStyle={styles.resultContent}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>WE CALCULATED</Text>
          <Text style={styles.summaryTotal}>${totals.calculatedTotal.toFixed(2)}</Text>
          {totals.actualTotal !== null ? (
            <>
              <Text style={styles.summaryLabel}>RECEIPT TOTAL</Text>
              <Text style={styles.summaryTotal}>${totals.actualTotal.toFixed(2)}</Text>
              {totals.totalDelta !== null && (
                <Text style={[styles.deltaText, totals.totalDelta > 0 ? styles.deltaOver : styles.deltaUnder]}>
                  {totals.totalDelta > 0 ? '+' : ''}${totals.totalDelta.toFixed(2)} {totals.totalDelta > 0 ? 'more' : 'less'} than expected
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.hint}>Couldn't read a total off the receipt.</Text>
          )}
        </View>

        {resolved.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MATCHED ITEMS</Text>
            {resolved.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={1}>{item.rawText}</Text>
                <View style={styles.itemPrices}>
                  <Text style={styles.itemPrice}>
                    {item.receiptPrice !== null ? `$${item.receiptPrice.toFixed(2)}` : '—'}
                    {item.calculatedPrice !== null ? ` vs $${item.calculatedPrice.toFixed(2)}` : ''}
                  </Text>
                  {item.priceDelta !== null && Math.abs(item.priceDelta) > 0.01 && (
                    <Text style={styles.itemDelta}>
                      {item.priceDelta > 0 ? '+' : ''}${item.priceDelta.toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {unmatched.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>COULDN'T MATCH — CONFIRM MANUALLY</Text>
            {unmatched.map((item) => (
              <View key={item.id} style={styles.unmatchedCard}>
                <Text style={styles.itemName}>{item.rawText}</Text>
                {item.receiptPrice !== null && (
                  <Text style={styles.hint}>${item.receiptPrice.toFixed(2)}</Text>
                )}
                {confirmingId === item.id ? (
                  <ActivityIndicator style={styles.confirmingSpinner} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {unresolvedBasketItems.map((basketItem) => (
                      <TouchableOpacity
                        key={basketItem.productId}
                        style={styles.chip}
                        onPress={() => handleConfirm(item, basketItem.productId)}
                      >
                        <Text style={styles.chipText}>{basketItem.name}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={[styles.chip, styles.chipReject]} onPress={() => handleConfirm(item, null)}>
                      <Text style={styles.chipTextReject}>Not in my basket</Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.rescanBtn} onPress={() => setResult(null)}>
          <Text style={styles.rescanBtnText}>Scan Another Receipt</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={() => { cameraReadyRef.current = true; }}
        >
          <View style={styles.overlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.hint2}>Frame the whole receipt, then tap Capture</Text>
          </View>
        </CameraView>
      )}
      {scanning && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Reading receipt…</Text>
        </View>
      )}
      <View style={styles.captureRow}>
        <TouchableOpacity style={styles.captureBtn} onPress={handleCapture} disabled={scanning} activeOpacity={0.8}>
          <Text style={styles.captureBtnText}>Capture Receipt</Text>
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
  scanFrame: { width: 280, height: 380, borderWidth: 2, borderColor: '#fff', borderRadius: 8 },
  hint2: { color: '#fff', fontSize: 15, opacity: 0.85, textAlign: 'center', paddingHorizontal: 24 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#fff', fontSize: 16 },
  captureRow: { padding: 16, backgroundColor: '#fff' },
  captureBtn: { backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  captureBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },

  resultContainer: { flex: 1, backgroundColor: '#fff' },
  resultContent: { padding: 20, gap: 20 },
  summaryCard: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, gap: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  summaryTotal: { fontSize: 24, fontWeight: '800', color: '#1e293b' },
  deltaText: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  deltaOver: { color: '#ef4444' },
  deltaUnder: { color: '#16a34a' },
  hint: { fontSize: 13, color: '#94a3b8' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  itemName: { flex: 1, fontSize: 14, color: '#1e293b', marginRight: 8 },
  itemPrices: { alignItems: 'flex-end' },
  itemPrice: { fontSize: 13, color: '#475569' },
  itemDelta: { fontSize: 12, fontWeight: '700', color: '#ef4444' },
  unmatchedCard: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 12, gap: 8 },
  confirmingSpinner: { alignSelf: 'flex-start' },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#475569' },
  chipReject: { borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  chipTextReject: { fontSize: 13, fontWeight: '600', color: '#ef4444' },
  rescanBtn: { paddingVertical: 14, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1' },
  rescanBtnText: { fontSize: 15, fontWeight: '600', color: '#2563eb' },
});
