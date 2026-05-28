export interface BasketItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  appliedDiscount: number;
  taxable: boolean;
  notes: string | null;
  imageUrl: string | null;
}

export interface BasketTotal {
  subtotal: number;
  discounts: number;
  tax: number;
  estimatedTotal: number;
}
