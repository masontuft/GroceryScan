import type { NutritionInfo } from './nutrition';

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  upc: string | null;
  ean: string | null;
  gtin: string | null;
  sku: string | null;
  size: string | null;
  unit: string | null;
  imageUrl: string | null;
  categories: string[];
  manufacturerPrefix: string | null;
  /** Only ever populated via scan-resolve; search/direct-lookup paths carry null. */
  nutrition: NutritionInfo | null;
}
