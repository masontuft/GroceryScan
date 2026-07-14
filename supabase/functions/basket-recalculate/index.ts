import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { applyPromotions } from '../_shared/promotionEngine.ts';
import { lookupGroceryTaxRate, lookupGeneralSalesTaxRate, isCategoryTaxExempt } from '../_shared/taxLookup.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  let body: {
    storeId?: string | null;
    items?: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      taxable: boolean;
      taxableOverridden?: boolean;
      category?: string | null;
    }>;
    location?: { state?: string | null; zip?: string | null; city?: string | null };
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { storeId, items, location } = body;
  if (!items?.length) return jsonResponse({ subtotal: 0, discounts: 0, tax: 0, estimatedTotal: 0 });

  try {
    const db = getAdminClient();

    // 1. Load best pricing for each product from DB. Locally-generated ids (e.g. manual/Winco
    // entries created client-side before a product row exists) aren't UUIDs and would error the
    // `.in()` query against a uuid column, so they're excluded here and fall back to client price.
    const productIds = items.map((i) => i.productId).filter((id) => UUID_RE.test(id));
    const { data: pricingRows, error: pricingError } = storeId && productIds.length
      ? await db.from('store_pricing').select('*').eq('store_id', storeId).in('product_id', productIds)
      : { data: [], error: null };
    if (pricingError) console.error('basket-recalculate: store_pricing query failed', pricingError);

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
    const { data: promotions, error: promotionsError } = storeId && productIds.length
      ? await db.from('promotions')
          .select('*')
          .eq('store_id', storeId)
          .in('product_id', productIds)
          .or(`start_date.is.null,start_date.lte.${now}`)
          .or(`end_date.is.null,end_date.gte.${now}`)
      : { data: [], error: null };
    if (promotionsError) console.error('basket-recalculate: promotions query failed', promotionsError);

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

    // 5. Calculate subtotal, discounts, and tax
    let subtotal = 0;
    let totalDiscounts = 0;
    let rawTax = 0;

    // Every state has (at minimum) a general sales tax rate, and separately a
    // grocery rate that's usually 0% but is a nonzero *reduced* rate in a few
    // states (MO, NC, TN, UT, AL, MS as of this writing) — so "exempt" items in
    // those states still owe tax, just less than a carved-out item. Applying a
    // single blended rate to a "taxable" subtotal (the old approach) either
    // zeroed out real grocery tax in those states or, in the far more common
    // 0%-grocery-rate states, silently charged $0 on candy/soda/general
    // merchandise that should be taxed at the general rate. Per-item rate
    // selection below fixes both.
    //
    // taxable is trusted as-is only when the shopper explicitly confirmed it via
    // BasketItemRow's manual toggle (taxableOverridden) — otherwise it's recomputed
    // from category + state here rather than trusting whatever the client last
    // stored, which can go stale (e.g. item added before location was known) or
    // drift from this file's exemptCategories data over time.
    const groceryRate = lookupGroceryTaxRate(location?.state ?? null, location?.city ?? null);
    const generalRate = lookupGeneralSalesTaxRate(location?.state ?? null, location?.city ?? null);
    for (const item of items) {
      const unitPrice = bestPriceMap[item.productId] ?? item.unitPrice;
      const lineTotal = unitPrice * item.quantity;
      const discount = discountByProduct[item.productId] ?? 0;
      subtotal += lineTotal;
      totalDiscounts += discount;
      const taxable = item.taxableOverridden
        ? item.taxable
        : !isCategoryTaxExempt(item.category ?? null, location?.state ?? null);
      const rate = taxable ? generalRate : groceryRate;
      rawTax += (lineTotal - discount) * rate;
    }

    const tax = Math.round(rawTax * 100) / 100;
    const estimatedTotal = Math.max(0, subtotal - totalDiscounts + tax);

    return jsonResponse({
      subtotal: Math.round(subtotal * 100) / 100,
      discounts: Math.round(totalDiscounts * 100) / 100,
      tax,
      estimatedTotal: Math.round(estimatedTotal * 100) / 100,
    });
  } catch (err) {
    console.error('basket-recalculate: unhandled error', err);
    return errorResponse('Failed to recalculate basket', 500);
  }
});
