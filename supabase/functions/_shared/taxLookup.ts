// Kept in sync manually with mobile/src/constants/taxRates.json (mobile's copy is used for
// the client-side useLocalTotal estimate). Edge functions can't import outside their deploy
// boundary, so this is a local copy rather than a shared reference.
import taxRates from './taxRates.json' with { type: 'json' };

interface TaxRate {
  state: string;
  groceryTaxRate: number;
  generalSalesTaxRate: number;
  effectiveDate: string;
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
