import { createClient } from '@supabase/supabase-js';
import type { Product } from '../types/product';
import type { StorePricing } from '../types/pricing';
import type { Promotion } from '../types/promotion';
import type { BasketItem, BasketTotal } from '../types/basket';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface ScanResult {
  product: Product;
  pricing: StorePricing[];
  promotions: Promotion[];
  confidence: number;
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
  const { data, error } = await supabase.functions.invoke('scan-resolve', {
    body: { barcode, storeId, location },
  });
  if (error) throw error;
  return data as ScanResult;
}

export async function recalculateBasket(
  storeId: string | null,
  items: BasketItem[],
  location: { state: string | null; zip: string | null }
): Promise<BasketTotal> {
  const { data, error } = await supabase.functions.invoke('basket-recalculate', {
    body: { storeId, items, location },
  });
  if (error) throw error;
  return data as BasketTotal;
}

export async function searchProducts(q: string, storeId: string | null): Promise<Product[]> {
  // Use supabase client query directly for search
  const query = supabase
    .from('products')
    .select('*')
    .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
    .limit(20);

  const result = await query;
  if (result.error) throw result.error;
  return (result.data ?? []) as Product[];
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
