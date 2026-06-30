import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraView as CameraViewType } from 'expo-camera';
import { ocrPriceTag } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useProductStore } from '../stores/productStore';
import { useBasketStore } from '../stores/basketStore';
import { useStoreStore } from '../stores/storeStore';
import { useLocationStore } from '../stores/locationStore';
import { formatCurrency } from '../utils/formatCurrency';
import { normalizeCategory, isTaxExempt } from '../utils/normalizeCategory';
import type { RootStackParamList } from '../app/index';
import type { Product } from '../types/product';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'WincoEntry'>;
  route: RouteProp<RootStackParamList, 'WincoEntry'>;
};

interface AddedEntry {
  id: string;
  name: string;
  price: number;
}

export function WincoQuickEntryScreen({ navigation, route }: Props) {
  const { initialBarcode } = route.params ?? {};

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [loadingProduct, setLoadingProduct] = useState(false);

  const [resolvedProduct, setResolvedProduct] = useState<Product | null>(null);
  const [productName, setProductName] = useState('');
  const [priceText, setPriceText] = useState('');
  const [nameEditable, setNameEditable] = useState(false);

  const [addedEntries, setAddedEntries] = useState<AddedEntry[]>([]);

  const [isPriceTagMode, setIsPriceTagMode] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  const lastScanned = useRef<string | null>(null);
  const priceInputRef = useRef<TextInput>(null);
  const cameraRef = useRef<CameraViewType>(null);

  const resolveProduct = useProductStore((s) => s.resolveProduct);
  const addItem = useBasketStore((s) => s.addItem);
  const selectedStoreId = useStoreStore((s) => s.selectedStoreId);
  const locationState = useLocationStore((s) => s.state);
  const locationZip = useLocationStore((s) => s.zip);

  useFocusEffect(useCallback(() => {
    lastScanned.current = null;
    setScanning(false);
    // Auto-resolve initialBarcode on first focus
    if (initialBarcode && !resolvedProduct && productName === '') {
      lookupBarcode(initialBarcode);
    }
  }, []));

  const lookupBarcode = async (barcode: string) => {
    if (loadingProduct) return;
    setLoadingProduct(true);
    setPriceText('');
    setResolvedProduct(null);

    try {
      // We pass storeId/location for product identity; pricing will be blank for Winco
      const result = await resolveProduct(barcode, selectedStoreId, {
        state: locationState,
        zip: locationZip,
      });
      setResolvedProduct(result.product);
      setProductName(result.product.name);
      setNameEditable(false);
    } catch {
      // Unknown barcode — let user type the name
      setResolvedProduct(null);
      setProductName('');
      setNameEditable(true);
    } finally {
      setLoadingProduct(false);
      setTimeout(() => priceInputRef.current?.focus(), 100);
    }
  };

  const handleBarcode = (barcode: string) => {
    if (lastScanned.current === barcode || loadingProduct) return;
    lastScanned.current = barcode;
    setScanning(true);
    lookupBarcode(barcode).finally(() => {
      setTimeout(() => {
        setScanning(false);
        lastScanned.current = null;
      }, 2000);
    });
  };

  const handleScanPriceTag = async () => {
    if (!cameraRef.current || ocrLoading) return;
    setIsPriceTagMode(true);
    setOcrLoading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (!photo?.base64) throw new Error('No image captured');
      const result = await ocrPriceTag(photo.base64);
      if (result.price !== null || result.productName !== null) {
        if (result.price !== null) setPriceText(result.price.toFixed(2));
        if (result.productName && nameEditable && !productName) {
          setProductName(result.productName);
        }
        if (result.price !== null) setTimeout(() => priceInputRef.current?.focus(), 100);
      } else {
        Alert.alert('No price found', 'Couldn\'t read a price from that image. Try moving closer to the label.');
      }
    } catch {
      Alert.alert('Error', 'Failed to scan price tag. Please try again or enter manually.');
    } finally {
      setOcrLoading(false);
      setIsPriceTagMode(false);
    }
  };

  const handleManualLookup = () => {
    const code = manualCode.trim();
    if (!code) return;
    setManualCode('');
    lookupBarcode(code);
  };

  const parsedPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));
  const priceValid = !isNaN(parsedPrice) && parsedPrice > 0;
  const nameValid = productName.trim().length > 0;
  const canAdd = priceValid && nameValid && !loadingProduct;

  const handleAdd = () => {
    if (!canAdd) return;
    const name = productName.trim();
    const category = normalizeCategory(resolvedProduct?.categories?.[0]);
    const productId = resolvedProduct?.id ?? `winco-${Date.now()}`;

    addItem({
      productId,
      name,
      quantity: 1,
      unitPrice: parsedPrice,
      appliedDiscount: 0,
      taxable: !isTaxExempt(category),
      notes: null,
      imageUrl: resolvedProduct?.imageUrl ?? null,
      category,
    });

    setAddedEntries((prev) => [{ id: productId, name, price: parsedPrice }, ...prev]);

    // Reset for next scan
    setResolvedProduct(null);
    setProductName('');
    setPriceText('');
    setNameEditable(false);
    lastScanned.current = null;
  };

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

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

  const hasForm = loadingProduct || resolvedProduct !== null || nameEditable;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* ── Camera ── */}
        <View style={styles.cameraWrapper}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128'] }}
            onBarcodeScanned={scanning || isPriceTagMode ? undefined : ({ data }) => {
              setScanning(true);
              handleBarcode(data);
            }}
          >
            <View style={styles.overlay}>
              <View style={styles.scanFrame} />
              <Text style={styles.hint}>
                {isPriceTagMode ? 'Aim at price label…' : 'Scan shelf barcode'}
              </Text>
              {ocrLoading && <ActivityIndicator color="#fff" />}
            </View>
          </CameraView>
          {loadingProduct && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Looking up product…</Text>
            </View>
          )}
        </View>

        {/* ── Manual barcode entry ── */}
        <View style={styles.manualRow}>
          <TextInput
            style={styles.manualInput}
            placeholder="Enter UPC manually"
            value={manualCode}
            onChangeText={setManualCode}
            keyboardType="number-pad"
            returnKeyType="search"
            onSubmitEditing={handleManualLookup}
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity style={styles.lookupBtn} onPress={handleManualLookup}>
            <Text style={styles.lookupBtnText}>Look up</Text>
          </TouchableOpacity>
        </View>

        {/* ── Price entry form ── */}
        {hasForm && (
          <View style={styles.form}>
            <Text style={styles.formLabel}>ITEM NAME</Text>
            {nameEditable ? (
              <TextInput
                style={styles.nameInput}
                value={productName}
                onChangeText={setProductName}
                placeholder="Type item name…"
                placeholderTextColor="#94a3b8"
                returnKeyType="next"
                autoFocus={nameEditable}
              />
            ) : (
              <Text style={styles.resolvedName} numberOfLines={2}>{productName}</Text>
            )}

            <Text style={[styles.formLabel, { marginTop: 12 }]}>SHELF PRICE</Text>
            <View style={styles.priceRow}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                ref={priceInputRef}
                style={styles.priceInput}
                value={priceText}
                onChangeText={setPriceText}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                returnKeyType="done"
                onSubmitEditing={handleAdd}
              />
              <TouchableOpacity
                style={styles.ocrBtn}
                onPress={handleScanPriceTag}
                disabled={ocrLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.ocrBtnText}>{ocrLoading ? '…' : '📷'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={!canAdd}
              activeOpacity={0.8}
            >
              <Text style={styles.addBtnText}>Add to Basket</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Items added this session ── */}
        {addedEntries.length > 0 && (
          <View style={styles.listSection}>
            <Text style={styles.listHeader}>Added ({addedEntries.length})</Text>
            <FlatList
              data={addedEntries}
              keyExtractor={(e) => e.id}
              renderItem={({ item: entry }) => (
                <View style={styles.entryRow}>
                  <Text style={styles.entryName} numberOfLines={1}>{entry.name}</Text>
                  <Text style={styles.entryPrice}>{formatCurrency(entry.price)}</Text>
                </View>
              )}
              style={styles.list}
            />
          </View>
        )}

        {/* ── Done button ── */}
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.doneBtnText}>Done — Go to Basket</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  permText: { fontSize: 16, color: '#334155', textAlign: 'center' },
  btn: { backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  cameraWrapper: { height: 200, position: 'relative', backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  scanFrame: { width: 220, height: 100, borderWidth: 2, borderColor: '#fff', borderRadius: 8 },
  hint: { color: '#fff', fontSize: 13, opacity: 0.85 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: { color: '#fff', fontSize: 14 },

  manualRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
    color: '#1e293b',
  },
  lookupBtn: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
  },
  lookupBtnText: { fontSize: 14, fontWeight: '600', color: '#334155' },

  form: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  resolvedName: { fontSize: 17, fontWeight: '700', color: '#1e293b' },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 52,
    paddingHorizontal: 12,
    gap: 6,
  },
  dollarSign: { fontSize: 22, fontWeight: '600', color: '#1e293b' },
  priceInput: { flex: 1, fontSize: 28, fontWeight: '700', color: '#1e293b' },
  ocrBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  ocrBtnText: { fontSize: 22 },
  addBtn: {
    marginTop: 14,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addBtnDisabled: { backgroundColor: '#86efac' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  listSection: { flex: 1, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  listHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
  },
  list: { flex: 1 },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  entryName: { flex: 1, fontSize: 14, color: '#334155', fontWeight: '500' },
  entryPrice: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginLeft: 12 },

  doneBtn: {
    margin: 16,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
