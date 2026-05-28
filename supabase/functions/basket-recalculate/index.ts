import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { applyPromotions } from '../_shared/promotionEngine.ts';
import { lookupGroceryTaxRate } from '../_shared/taxLookup.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  let body: {
    storeId?: string | null;
    items?: Array<{ productId: string; quantity: number; unitPrice: number; taxable: boolean }>;
    location?: { state?: string | null; zip?: string | null; city?: string | null };
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { storeId, items, location } = body;
  if (!items?.length) return jsonResponse({ subtotal: 0, discounts: 0, tax: 0, estimatedTotal: 0 });

  const db = getAdminClient();

  // 1. Load best pricing for each product from DB
  const productIds = items.map((i) => i.productId);
  const { data: pricingRows } = storeId
    ? await db.from('store_pricing').select('*').eq('store_id', storeId).in('product_id', productIds)
    : { data: [] };

  // Build a map: productId → best price
  const bestPriceMap: Record<string, number> = {};
  for (const row of (pricingRows ?? []) as Array<Record<string, unknown>>) {
    const productId = row.product_id as string;
    const price = (row.sale_price ?? row.regular_price) as number | null;
    if (price === null) continue;
    const existing = bestPriceMap[productId];
    if (existing === undefined || price < existing) bestPriceMap[productId] = price;
  }

  // 2. Load active promotions
  const now = new Date().toISOString();
  const { data: promotions } = storeId
    ? await db.from('promotions')
        .select('*')
        .eq('store_id', storeId)
        .in('product_id', productIds)
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`)
    : { data: [] };

  // 3. Build line items using DB price if available, fallback to client price
  const lineItems = items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: bestPriceMap[item.productId] ?? item.unitPrice,
  }));

  // 4. Apply promotions
  const discountResults = applyPromotions(lineItems, (promotions ?? []) as Parameters<typeof applyPromotions>[1]);
  const discountByProduct: Record<string, number> = {};
  for (const d of discountResults) {
    discountByProduct[d.productId] = (discountByProduct[d.productId] ?? 0) + d.discountAmount;
  }

  // 5. Calculate subtotal and discounts
  let subtotal = 0;
  let taxableSubtotal = 0;
  let totalDiscounts = 0;

  for (const item of items) {
    const unitPrice = bestPriceMap[item.productId] ?? item.unitPrice;
    const lineTotal = unitPrice * item.quantity;
    const discount = discountByProduct[item.productId] ?? 0;
    subtotal += lineTotal;
    totalDiscounts += discount;
    if (item.taxable) taxableSubtotal += lineTotal - discount;
  }

  // 6. Tax
  const taxRate = lookupGroceryTaxRate(location?.state ?? null, location?.city ?? null);
  const tax = Math.round(taxableSubtotal * taxRate * 100) / 100;

  const estimatedTotal = Math.max(0, subtotal - totalDiscounts + tax);

  return jsonResponse({
    subtotal: Math.round(subtotal * 100) / 100,
    discounts: Math.round(totalDiscounts * 100) / 100,
    tax,
    estimatedTotal: Math.round(estimatedTotal * 100) / 100,
  });
});
