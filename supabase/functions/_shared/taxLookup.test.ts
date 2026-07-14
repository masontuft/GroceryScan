import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { lookupGroceryTaxRate, lookupGeneralSalesTaxRate, isCategoryTaxExempt } from './taxLookup.ts';

// isCategoryTaxExempt — one case per exemption group described in
// normalizeCategory.ts's isTaxExempt comment, plus the unknown-input defaults.
Deno.test('isCategoryTaxExempt - full-tax state exempts nothing', () => {
  assertEquals(isCategoryTaxExempt('Produce', 'ID'), false);
  assertEquals(isCategoryTaxExempt('Meat & Seafood', 'ID'), false);
});

Deno.test('isCategoryTaxExempt - candy+soda carve-out state (IL/WI/TN group)', () => {
  assertEquals(isCategoryTaxExempt('Produce', 'IL'), true);
  assertEquals(isCategoryTaxExempt('Snacks', 'IL'), false);
  assertEquals(isCategoryTaxExempt('Beverages', 'IL'), false);
  assertEquals(isCategoryTaxExempt('Snacks', 'WI'), false);
  assertEquals(isCategoryTaxExempt('Beverages', 'WI'), false);
});

Deno.test('isCategoryTaxExempt - candy-exempt/soda-taxed state (CA group)', () => {
  assertEquals(isCategoryTaxExempt('Snacks', 'CA'), true);
  assertEquals(isCategoryTaxExempt('Beverages', 'CA'), false);
});

Deno.test('isCategoryTaxExempt - no-carve-out state rides full exemption (VA)', () => {
  // VA uses the federal SNAP food definition, not the SST candy/soda carve-out —
  // both Snacks and Beverages are exempt, unlike most other states.
  assertEquals(isCategoryTaxExempt('Snacks', 'VA'), true);
  assertEquals(isCategoryTaxExempt('Beverages', 'VA'), true);
});

Deno.test('isCategoryTaxExempt - general merchandise never exempt', () => {
  assertEquals(isCategoryTaxExempt('Household', 'TX'), false);
  assertEquals(isCategoryTaxExempt('Personal Care', 'CA'), false);
});

Deno.test('isCategoryTaxExempt - no-sales-tax state exempts everything', () => {
  assertEquals(isCategoryTaxExempt('Household', 'OR'), true);
  assertEquals(isCategoryTaxExempt('Personal Care', 'OR'), true);
});

Deno.test('isCategoryTaxExempt - missing category or state defaults to not exempt', () => {
  assertEquals(isCategoryTaxExempt(null, 'CA'), false);
  assertEquals(isCategoryTaxExempt('Produce', null), false);
});

// Per-item rate selection — mirrors the formula in basket-recalculate/index.ts
// and mobile/src/hooks/useLocalTotal.ts: exempt items pay groceryTaxRate
// (usually 0%, but nonzero in MO/NC/TN/UT/AL/MS), non-exempt items pay
// generalSalesTaxRate. This is the bug the PR fixed — a single blended rate
// either zeroed out real grocery tax (TN produce) or silently charged $0 on
// carved-out items in 0%-grocery states (CA soda).
function computeTax(category: string, unitPrice: number, state: string): number {
  const groceryRate = lookupGroceryTaxRate(state, null);
  const generalRate = lookupGeneralSalesTaxRate(state, null);
  const rate = isCategoryTaxExempt(category, state) ? groceryRate : generalRate;
  return Math.round(unitPrice * rate * 100) / 100;
}

Deno.test('tax calc - CA candy (exempt) rides 0% grocery rate', () => {
  assertEquals(computeTax('Snacks', 2, 'CA'), 0.0);
});

Deno.test('tax calc - CA soda (carved out) hits the general rate, not $0', () => {
  const tax = computeTax('Beverages', 2, 'CA');
  assertEquals(tax > 0, true);
});

Deno.test('tax calc - IL candy hits the general rate, not the low grocery rate', () => {
  assertEquals(computeTax('Snacks', 2, 'IL'), 0.13); // 2 * 0.0625, not 2 * groceryTaxRate
});

Deno.test('tax calc - TN produce is taxed at its real reduced rate, not zeroed to $0', () => {
  assertEquals(computeTax('Produce', 10, 'TN'), 0.4); // 10 * 0.04
});

Deno.test('tax calc - TN candy hits the higher general rate', () => {
  assertEquals(computeTax('Snacks', 10, 'TN'), 0.7); // 10 * 0.07
});

Deno.test('tax calc - MO produce is taxed at its real reduced rate, not zeroed to $0', () => {
  assertEquals(computeTax('Produce', 10, 'MO'), 0.11); // 10 * 0.0113
});

Deno.test('tax calc - OR (no sales tax) is always $0 regardless of category', () => {
  assertEquals(computeTax('Household', 10, 'OR'), 0.0);
});
