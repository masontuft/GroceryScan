export type PromotionType = 'bogo' | 'markdown' | 'digital_coupon' | 'member';

export interface Promotion {
  id: string;
  storeId: string;
  productId: string;
  type: PromotionType;
  description: string | null;
  discountValue: number | null;
  eligibilityRules: Record<string, unknown> | null;
  startDate: string | null;
  endDate: string | null;
  version: number;
}
