// Kept in sync manually with mobile/src/constants/taxRates.json (mobile's copy is used for
// the client-side useLocalTotal estimate). Edge functions can't import outside their deploy
// boundary, so this is a local copy rather than a shared reference.
import taxRates from './taxRates.json' with { type: 'json' };

interface TaxRate {
  state: string;
  groceryTaxRate: number;
  generalSalesTaxRate: number;
  effectiveDate: string;
  exemptCategories: string[];
}

interface CityOverride {
  state: string;
  city: string;
  groceryTaxRate: number;
  generalSalesTaxRate: number;
}

export function lookupGroceryTaxRate(state: string | null, city: string | null): number {
  if (!state) return 0;

  const stateCode = state.toUpperCase().trim();

  if (city) {
    const cityOverride = (taxRates.cityOverrides as CityOverride[]).find(
      (o) => o.state === stateCode && o.city.toLowerCase() === city.toLowerCase()
    );
    if (cityOverride) return cityOverride.groceryTaxRate;
  }

  const stateRate = (taxRates.states as TaxRate[]).find((s) => s.state === stateCode);
  return stateRate?.groceryTaxRate ?? 0;
}

// Same city-override-then-state-fallback shape as lookupGroceryTaxRate, but for
// the general/full sales tax rate — used for line items that don't qualify for
// grocery-rate treatment (see isCategoryTaxExempt below).
export function lookupGeneralSalesTaxRate(state: string | null, city: string | null): number {
  if (!state) return 0;

  const stateCode = state.toUpperCase().trim();

  if (city) {
    const cityOverride = (taxRates.cityOverrides as CityOverride[]).find(
      (o) => o.state === stateCode && o.city.toLowerCase() === city.toLowerCase()
    );
    if (cityOverride) return cityOverride.generalSalesTaxRate;
  }

  const stateRate = (taxRates.states as TaxRate[]).find((s) => s.state === stateCode);
  return stateRate?.generalSalesTaxRate ?? 0;
}

// Mirrors mobile/src/utils/normalizeCategory.ts's isTaxExempt — see that file's
// comment for why Snacks/Beverages exemption is a category-level proxy for
// candy/soda carve-outs rather than an exact item-level rule, and for the
// per-state exemptCategories data/citations in taxRates.json.
//
// "Exempt" here means "qualifies for grocery-rate treatment", not "pays $0" —
// in the handful of states with a nonzero-but-reduced groceryTaxRate (MO, NC,
// TN, UT, AL, MS), an exempt item still pays that reduced rate, just not the
// higher generalSalesTaxRate a carved-out item (candy/soda proxy, or general
// merchandise) pays. See basket-recalculate/index.ts for how the two rates are
// applied per item; a client item with taxableOverridden:true skips this
// category-driven pick entirely and uses the shopper's explicit choice instead.
export function isCategoryTaxExempt(category: string | null, state: string | null): boolean {
  if (!category || !state) return false;
  const stateCode = state.toUpperCase().trim();
  const row = (taxRates.states as TaxRate[]).find((s) => s.state === stateCode);
  if (!row) return false;
  if (row.generalSalesTaxRate === 0) return true; // no state sales tax at all
  return row.exemptCategories.includes(category);
}
