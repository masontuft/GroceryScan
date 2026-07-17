export interface PromotionRow {
  id: string;
  store_id: string;
  product_id: string;
  type: 'bogo' | 'markdown' | 'digital_coupon' | 'member';
  description: string | null;
  discount_value: number | null;
  eligibility_rules: Record<string, unknown> | null;
  start_date: string | null;
  end_date: string | null;
  version: number;
}

export interface LineItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  // Absent/'each' means a whole-unit count; 'lb'/'kg' means quantity is a
  // fractional weight, which BOGO's "every other unit is free" math doesn't
  // mean anything for.
  unit?: 'each' | 'lb' | 'kg';
}

export interface DiscountResult {
  productId: string;
  promotionId: string;
  discountAmount: number;
  description: string;
}

export function applyPromotions(items: LineItem[], promotions: PromotionRow[]): DiscountResult[] {
  const results: DiscountResult[] = [];
  const now = new Date();

  const active = promotions.filter((p) => {
    const start = p.start_date ? new Date(p.start_date) : null;
    const end = p.end_date ? new Date(p.end_date) : null;
    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
  });

  // Item-level discounts first (higher priority)
  for (const item of items) {
    const itemPromos = active.filter((p) => p.product_id === item.productId);

    // Sort: markdown > digital_coupon > member > bogo
    const priorityOrder = ['markdown', 'digital_coupon', 'member', 'bogo'];
    itemPromos.sort((a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type));

    let appliedItemPromo = false;

    for (const promo of itemPromos) {
      if (appliedItemPromo) break; // one item-level promo per product

      if (promo.type === 'markdown' && promo.discount_value !== null) {
        results.push({
          productId: item.productId,
          promotionId: promo.id,
          discountAmount: promo.discount_value * item.quantity,
          description: promo.description ?? `$${promo.discount_value} off`,
        });
        appliedItemPromo = true;
      }

      if (promo.type === 'digital_coupon' && promo.discount_value !== null) {
        results.push({
          productId: item.productId,
          promotionId: promo.id,
          discountAmount: promo.discount_value,
          description: promo.description ?? `$${promo.discount_value} digital coupon`,
        });
        appliedItemPromo = true;
      }

      if (promo.type === 'member' && promo.discount_value !== null) {
        results.push({
          productId: item.productId,
          promotionId: promo.id,
          discountAmount: promo.discount_value * item.quantity,
          description: promo.description ?? `Member price`,
        });
        appliedItemPromo = true;
      }

      if (promo.type === 'bogo' && (item.unit ?? 'each') === 'each' && item.quantity >= 2) {
        const freeItems = Math.floor(item.quantity / 2);
        results.push({
          productId: item.productId,
          promotionId: promo.id,
          discountAmount: freeItems * item.unitPrice,
          description: promo.description ?? 'Buy One Get One Free',
        });
        appliedItemPromo = true;
      }
    }
  }

  return results;
}
