export interface BasketItem {
  productId: string;
  name: string;
  quantity: number;
  unit: 'each' | 'lb' | 'kg';
  unitPrice: number;
  appliedDiscount: number;
  taxable: boolean;
  // True once the shopper has explicitly confirmed `taxable` via the manual
  // toggle in BasketItemRow. basket-recalculate trusts an override as-is;
  // otherwise it recomputes taxable server-side from category + state so a
  // stale/missing location at add-time doesn't silently freeze in a wrong
  // default (see supabase/functions/basket-recalculate/index.ts).
  taxableOverridden: boolean;
  notes: string | null;
  imageUrl: string | null;
  category: string | null;
  // Which PricingProvider (StorePricing.source, e.g. 'kroger', 'serpapi_walmart')
  // supplied unitPrice, or 'manual' for hand-entered prices. Null for items added
  // before this field existed (backfilled by basketStore's v2 migrate()). Lets
  // receipt-compare attribute price deltas back to a specific provider.
  priceSource: string | null;
}

export interface BasketTotal {
  subtotal: number;
  discounts: number;
  tax: number;
  estimatedTotal: number;
}
