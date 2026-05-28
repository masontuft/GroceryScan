export interface TaxProfile {
  state: string;
  county: string | null;
  city: string | null;
  groceryTaxRate: number;
  generalSalesTaxRate: number;
  effectiveDate: string;
}
