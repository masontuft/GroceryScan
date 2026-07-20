import { createClient } from '@supabase/supabase-js';
import type { Product } from '../types/product';
import type { StorePricing } from '../types/pricing';
import type { Promotion } from '../types/promotion';
import type { BasketItem, BasketTotal } from '../types/basket';
import { trackError } from './analytics';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

// createClient throws synchronously on an empty URL. Since this module loads
// before React mounts, that throw would kill the JS bundle before the splash
// screen's auto-hide ever fires, freezing the app on the native splash with
// no visible error. Fall back to a placeholder so the module always loads;
// isSupabaseConfigured gates whether the app renders a real error screen instead.
export const supabase = createClient(
  isSupabaseConfigured ? SUPABASE_URL : 'https://placeholder.invalid',
  isSupabaseConfigured ? SUPABASE_ANON_KEY : 'placeholder-anon-key'
);

export interface ScanResult {
  product: Product;
  pricing: StorePricing[];
  promotions: Promotion[];
  confidence: number;
}

// Thrown by invokeFunction on any Edge Function failure, carrying enough structure
// (endpoint, HTTP status, raw body) for callers to distinguish "not found" from
// "network/server failure" and for PostHog to get a machine-readable exception
// instead of a bare "non-2xx" message.
export class EdgeFunctionError extends Error {
  readonly endpoint: string;
  readonly status: number | null;
  readonly body: string | null;

  constructor(endpoint: string, status: number | null, body: string | null, message: string) {
    super(message);
    this.name = 'EdgeFunctionError';
    this.endpoint = endpoint;
    this.status = status;
    this.body = body;
  }
}

async function invokeFunction<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(endpoint, { body });
  if (!error) return data as T;

  // FunctionsHttpError carries the raw Response on `error.context`; other
  // Supabase function error types (relay/network failures) don't.
  const ctx = (error as unknown as { context?: Response }).context;
  if (!(ctx instanceof Response)) {
    throw new EdgeFunctionError(endpoint, null, null, error.message);
  }

  const bodyText = await ctx.text().catch(() => null);
  let serverMessage: string | null = null;
  if (bodyText) {
    try {
      serverMessage = (JSON.parse(bodyText) as { error?: string }).error ?? null;
    } catch {
      // Body wasn't JSON — bodyText is still attached to the thrown error below.
    }
  }
  throw new EdgeFunctionError(endpoint, ctx.status, bodyText, serverMessage ?? error.message);
}

export interface Store {
  id: string;
  chain: string;
  name: string;
  region: string | null;
  locationId: string | null;
}

export async function resolveBarcode(
  barcode: string,
  storeId: string | null,
  location: { state: string | null; zip: string | null }
): Promise<ScanResult> {
  return invokeFunction<ScanResult>('scan-resolve', { barcode, storeId, location });
}

export async function recalculateBasket(
  storeId: string | null,
  items: BasketItem[],
  location: { state: string | null; zip: string | null }
): Promise<BasketTotal> {
  return invokeFunction<BasketTotal>('basket-recalculate', { storeId, items, location });
}

export async function searchProducts(q: string, _storeId: string | null): Promise<Product[]> {
  const { data, error } = await supabase.rpc('search_products_fuzzy', { query: q, threshold: 0.3 });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    brand: row.brand as string | null,
    barcode: row.barcode as string | null,
    upc: row.upc as string | null,
    ean: row.ean as string | null,
    gtin: row.gtin as string | null,
    sku: row.sku as string | null,
    size: row.size as string | null,
    unit: row.unit as string | null,
    imageUrl: row.image_url as string | null,
    categories: (row.categories as string[]) ?? [],
    manufacturerPrefix: (row.manufacturer_prefix as string | null) ?? null,
    nutrition: null, // nutrition only ever arrives via scan-resolve
  }));
}

export async function submitManualEntry(args: {
  barcode?: string;
  rawBarcode?: string;
  productName?: string;
  price: number;
  storeId?: string | null;
  customStoreName?: string | null;
  existingProductId?: string | null;
  brand?: string | null;
  size?: string | null;
  unit?: string | null;
  categories?: string[] | null;
}): Promise<{ productId: string; storeId: string | null }> {
  return invokeFunction<{ productId: string; storeId: string | null }>('manual-submit', args);
}

/**
 * Direct client-side lookup of a product by barcode/UPC/EAN/GTIN.
 * Used as a fallback when scan-resolve returns 404, so that products
 * entered manually via ManualPriceScreen are always discoverable on
 * re-scan without requiring a pricing provider to match.
 * Returns null if no product row is found.
 */
export async function lookupProductByBarcode(barcode: string): Promise<ScanResult | null> {
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .or(`barcode.eq.${barcode},upc.eq.${barcode},ean.eq.${barcode},gtin.eq.${barcode}`)
    .maybeSingle();

  if (error) {
    trackError('lookupProductByBarcode', error, { barcode });
    return null;
  }
  if (!product) return null;

  // Also fetch any stored pricing rows for this product so the best price
  // can be selected (including manually-entered prices from manual-submit).
  const { data: pricingRows } = await supabase
    .from('store_pricing')
    .select('*')
    .eq('product_id', product.id)
    .order('confidence_score', { ascending: false });

  const pricing: StorePricing[] = (pricingRows ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    storeId: row.store_id as string,
    productId: row.product_id as string,
    regularPrice: row.regular_price as number,
    salePrice: row.sale_price as number | null,
    effectiveStart: row.effective_start as string | null,
    effectiveEnd: row.effective_end as string | null,
    sourceTimestamp: row.source_timestamp as string,
    confidenceScore: row.confidence_score as number,
    source: row.source as string,
  }));

  return {
    product: {
      id: product.id as string,
      name: product.name as string,
      brand: product.brand as string | null,
      barcode: product.barcode as string | null,
      upc: product.upc as string | null,
      ean: product.ean as string | null,
      gtin: product.gtin as string | null,
      sku: product.sku as string | null,
      size: product.size as string | null,
      unit: product.unit as string | null,
      imageUrl: product.image_url as string | null,
      categories: (product.categories as string[]) ?? [],
      manufacturerPrefix: product.manufacturer_prefix as string | null ?? null,
      nutrition: null, // nutrition only ever arrives via scan-resolve
    },
    pricing,
    promotions: [],
    confidence: pricing.length > 0 ? Math.max(...pricing.map((p) => p.confidenceScore)) : 0,
  };
}

export async function ocrPriceTag(imageBase64: string): Promise<{ price: number | null; productName: string | null; rawText: string; extractedUpc: string | null }> {
  return invokeFunction('ocr-price', { imageBase64 });
}

export interface ReceiptComparisonItem {
  id: string;
  productId: string | null;
  rawText: string;
  receiptPrice: number | null;
  calculatedPrice: number | null;
  priceDelta: number | null;
  matchMethod: 'fuzzy_auto' | 'unmatched' | 'manual_confirm';
}

export interface ReceiptComparisonResult {
  receiptScanId: string;
  storeNameGuess: string | null;
  totals: {
    calculatedSubtotal: number;
    calculatedTax: number;
    calculatedTotal: number;
    actualSubtotal: number | null;
    actualTax: number | null;
    actualTotal: number | null;
    totalDelta: number | null;
  };
  items: ReceiptComparisonItem[];
}

export async function compareReceipt(args: {
  imageBase64: string;
  storeId: string | null;
  basketSnapshot: BasketItem[];
  calculatedTotal: BasketTotal;
}): Promise<ReceiptComparisonResult> {
  return invokeFunction<ReceiptComparisonResult>('receipt-compare', args);
}

export async function confirmReceiptMatch(args: {
  receiptScanItemId: string;
  productId: string | null;
}): Promise<{ id: string; matchMethod: string; productId: string | null; calculatedPrice: number | null; priceDelta: number | null }> {
  return invokeFunction('receipt-confirm', args);
}

/**
 * Resolves a device lat/lng to the nearest real store for a chain (currently
 * only 'walmart' is supported server-side) and upserts it into the `stores`
 * table. Never throws — this is a best-effort background/on-demand lookup;
 * callers treat `null` as "couldn't resolve" and show their own messaging.
 */
export async function resolveNearbyStore(args: {
  chain: string;
  lat: number;
  lng: number;
}): Promise<Store | null> {
  try {
    const data = await invokeFunction<{ store: Store | null }>('resolve-nearby-store', args);
    return data.store ?? null;
  } catch (err) {
    trackError('resolveNearbyStore', err, err instanceof EdgeFunctionError ? { endpoint: err.endpoint, status: err.status } : undefined);
    return null;
  }
}

export async function fetchStores(): Promise<Store[]> {
  const { data, error } = await supabase.from('stores').select('*').eq('active', true);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    chain: row.chain as string,
    name: row.name as string,
    region: row.region as string | null,
    locationId: row.location_id as string | null,
  }));
}
