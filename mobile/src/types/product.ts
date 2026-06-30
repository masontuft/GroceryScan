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
}
