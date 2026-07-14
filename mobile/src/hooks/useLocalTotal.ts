import { useMemo } from 'react';
import taxData from '../constants/taxRates.json';
import type { BasketItem, BasketTotal } from '../types/basket';

interface TaxEntry {
  state: string;
  groceryTaxRate: number;
  generalSalesTaxRate: number;
}

interface CityOverride {
  state: string;
  city: string;
  groceryTaxRate: number;
  generalSalesTaxRate: number;
}

const states: TaxEntry[] = (taxData as { states: TaxEntry[]; cityOverrides?: CityOverride[] }).states;
const cityOverrides: CityOverride[] =
  (taxData as { states: TaxEntry[]; cityOverrides?: CityOverride[] }).cityOverrides ?? [];

function getGroceryTaxRate(stateCode: string | null, city: string | null): number {
  if (!stateCode) return 0;
  const upperState = stateCode.toUpperCase();
  if (city) {
    const override = cityOverrides.find(
      (o) =>
        o.state.toUpperCase() === upperState &&
        o.city.toLowerCase() === city.toLowerCase()
    );
    if (override) return override.groceryTaxRate;
  }
  const entry = states.find((s) => s.state.toUpperCase() === upperState);
  return entry?.groceryTaxRate ?? 0;
}

// Mirrors getGroceryTaxRate but reads the general/full rate — used for items
// that don't qualify for grocery-rate treatment (item.taxable === true). See
// basket-recalculate/index.ts for why a single blended rate was wrong: most
// states have a 0% grocery rate, but a few (MO, NC, TN, UT, AL, MS) have a
// nonzero reduced rate, so "not taxable" still owes tax there — just less than
// a carved-out (candy/soda proxy, or general merchandise) item.
function getGeneralSalesTaxRate(stateCode: string | null, city: string | null): number {
  if (!stateCode) return 0;
  const upperState = stateCode.toUpperCase();
  if (city) {
    const override = cityOverrides.find(
      (o) =>
        o.state.toUpperCase() === upperState &&
        o.city.toLowerCase() === city.toLowerCase()
    );
    if (override) return override.generalSalesTaxRate;
  }
  const entry = states.find((s) => s.state.toUpperCase() === upperState);
  return entry?.generalSalesTaxRate ?? 0;
}

/**
 * Computes a BasketTotal locally using the bundled tax rate JSON.
 * Used as a fallback when the backend basket-recalculate call fails or
 * hasn't returned yet. Always produces a result so the totals row is
 * never blank on the basket screen.
 */
export function useLocalTotal(
  items: BasketItem[],
  stateCode: string | null,
  city: string | null
): BasketTotal {
  return useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      const linePrice = item.unitPrice * item.quantity;
      const discount = item.appliedDiscount ?? 0;
      return sum + linePrice - discount;
    }, 0);

    const discounts = items.reduce((sum, item) => sum + (item.appliedDiscount ?? 0), 0);

    const groceryRate = getGroceryTaxRate(stateCode, city);
    const generalRate = getGeneralSalesTaxRate(stateCode, city);
    const rawTax = items.reduce((sum, item) => {
      const linePrice = item.unitPrice * item.quantity;
      const discount = item.appliedDiscount ?? 0;
      const rate = item.taxable ? generalRate : groceryRate;
      return sum + (linePrice - discount) * rate;
    }, 0);
    const tax = Math.round(rawTax * 100) / 100;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discounts: Math.round(discounts * 100) / 100,
      tax,
      estimatedTotal: Math.round((subtotal + tax) * 100) / 100,
    };
  }, [items, stateCode, city]);
}
