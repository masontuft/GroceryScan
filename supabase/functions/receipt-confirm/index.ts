import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

/**
 * receipt-confirm — resolves an 'unmatched' receipt_scan_items row after the
 * user manually picks (or explicitly rejects) a matching basket item, following
 * receipt-compare's fuzzy-match pass. Only touches rows still in 'unmatched'
 * state, so a stale/duplicate confirm can't clobber an already-resolved row.
 *
 * Body:
 *   receiptScanItemId — id of the receipt_scan_items row being confirmed
 *   productId          — the basket item's productId the user matched it to,
 *                         or null if the user says this line isn't in their basket
 *
 * Returns: { id, matchMethod, productId, calculatedPrice, priceDelta }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    return await handleRequest(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[receipt-confirm] unhandled error:', message);
    return errorResponse(`Internal error: ${message}`, 500);
  }
});

const round2 = (n: number) => Math.round(n * 100) / 100;

async function handleRequest(req: Request) {
  let body: { receiptScanItemId?: string; productId?: string | null };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { receiptScanItemId, productId } = body;
  if (!receiptScanItemId) return errorResponse('receiptScanItemId is required');

  const db = getAdminClient();

  const { data: itemRow, error: itemErr } = await db
    .from('receipt_scan_items')
    .select('id, receipt_scan_id, receipt_line_price, match_method')
    .eq('id', receiptScanItemId)
    .maybeSingle();

  if (itemErr) return errorResponse(`Failed to load receipt scan item: ${itemErr.message}`, 500);
  if (!itemRow) return errorResponse('receipt_scan_item not found', 404);
  if (itemRow.match_method !== 'unmatched') {
    return errorResponse('This receipt line has already been resolved', 409);
  }

  // No product selected — user confirmed this receipt line just isn't in
  // their basket (e.g. an in-store impulse buy). Mark resolved with no match.
  if (!productId) {
    const { data: updated, error: updateErr } = await db
      .from('receipt_scan_items')
      .update({ match_method: 'manual_confirm', product_id: null })
      .eq('id', receiptScanItemId)
      .select('id, match_method, product_id, calculated_price, price_delta')
      .single();

    if (updateErr || !updated) {
      return errorResponse(`Failed to confirm: ${updateErr?.message ?? 'unknown error'}`, 500);
    }
    return jsonResponse({
      id: updated.id, matchMethod: updated.match_method,
      productId: updated.product_id, calculatedPrice: updated.calculated_price, priceDelta: updated.price_delta,
    });
  }

  // Look up the matched basket item's calculated price from the scan's
  // basket_snapshot (the source of truth for "what we calculated" — pricing
  // may have moved on since the scan, so we don't re-query store_pricing).
  const { data: scanRow, error: scanErr } = await db
    .from('receipt_scans')
    .select('basket_snapshot')
    .eq('id', itemRow.receipt_scan_id)
    .maybeSingle();

  if (scanErr || !scanRow) return errorResponse('Failed to load parent receipt scan', 500);

  const basketSnapshot = (scanRow.basket_snapshot ?? []) as Array<{
    productId: string; unitPrice: number; quantity: number; priceSource?: string | null;
  }>;
  const basketItem = basketSnapshot.find((i) => i.productId === productId);
  if (!basketItem) return errorResponse('productId does not match any item in this receipt scan’s basket', 400);

  const calculatedPrice = round2(basketItem.unitPrice * basketItem.quantity);
  const receiptPrice = itemRow.receipt_line_price as number | null;
  const priceDelta = receiptPrice !== null ? round2(receiptPrice - calculatedPrice) : null;

  const { data: updated, error: updateErr } = await db
    .from('receipt_scan_items')
    .update({
      product_id: productId,
      calculated_price: calculatedPrice,
      price_delta: priceDelta,
      price_source: basketItem.priceSource ?? null,
      match_method: 'manual_confirm',
    })
    .eq('id', receiptScanItemId)
    .select('id, match_method, product_id, calculated_price, price_delta')
    .single();

  if (updateErr || !updated) {
    return errorResponse(`Failed to confirm: ${updateErr?.message ?? 'unknown error'}`, 500);
  }

  return jsonResponse({
    id: updated.id, matchMethod: updated.match_method,
    productId: updated.product_id, calculatedPrice: updated.calculated_price, priceDelta: updated.price_delta,
  });
}
