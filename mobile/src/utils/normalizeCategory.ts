import taxRates from '../constants/taxRates.json';

const RULES: Array<[RegExp, string]> = [
  [/(produce|fruit|vegetable|fresh\s+veg|salad|herb|lettuce|spinach|tomato|pepper|onion|garlic)/i, 'Produce'],
  [/(meat|beef|pork|lamb|chicken|turkey|poultry|seafood|fish|shrimp|lobster|crab|deli|sausage|bacon|ham)/i, 'Meat & Seafood'],
  [/(dair(y|ies)|milk|cheese|yogurt|kefir|butter|egg|cream|creamer|sour\s+cream|cottage|fermented-milk)/i, 'Dairy & Eggs'],
  [/(bak(e|ery|ed)|bread|bagel|muffin|pastry|cake|cookie|cracker|roll|bun|tortilla|pita)/i, 'Bakery & Bread'],
  [/(frozen)/i, 'Frozen'],
  [/(beverage|drink|juice|soda|water|coffee|tea|wine|beer|alcohol|spirits|energy\s+drink|sports\s+drink)/i, 'Beverages'],
  [/(snack|chip|crisp|candy|chocolate|nut|popcorn|pretzel|trail\s+mix|granola\s+bar)/i, 'Snacks'],
  [/(pantry|can(ned)?|soup|sauce|pasta|noodle|rice|cereal|grain|spice|condiment|oil|vinegar|broth|stock|baking|flour|sugar)/i, 'Pantry'],
  [/(household|clean(ing)?|laundry|detergent|paper\s+towel|trash|garbage|toilet|sponge|dish\s+(soap|wash))/i, 'Household'],
  [/(personal\s+care|hygiene|shampoo|soap|toothpaste|deodorant|cosmetic|beauty|skin\s+care|lotion|razor|feminine)/i, 'Personal Care'],
  [/(baby|infant|diaper|formula|wipe)/i, 'Baby'],
  [/(pet|dog|cat|bird|aquarium|fish\s+food)/i, 'Pet'],
  [/(health|vitamin|supplement|medicine|pharmacy|first\s+aid|bandage|pain|allergy|cold|flu)/i, 'Health'],
];

export const STANDARD_CATEGORIES = [
  'Produce',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Bakery & Bread',
  'Frozen',
  'Beverages',
  'Snacks',
  'Pantry',
  'Household',
  'Personal Care',
  'Baby',
  'Pet',
  'Health',
  'Other',
] as const;

export type GroceryCategory = (typeof STANDARD_CATEGORIES)[number];

export function normalizeCategory(raw: string | string[] | null | undefined): GroceryCategory {
  const inputs = Array.isArray(raw) ? raw : [raw];
  for (const input of inputs) {
    if (!input) continue;
    for (const [pattern, label] of RULES) {
      if (pattern.test(input)) return label as GroceryCategory;
    }
  }
  return 'Other';
}

interface StateTaxRow {
  state: string;
  generalSalesTaxRate: number;
  exemptCategories: string[];
}

const TAX_STATES = (taxRates as { states: StateTaxRow[] }).states;

// Category-based exemption is state-specific: Idaho, Mississippi, Alabama, South
// Dakota, and Hawaii tax raw groceries at close to the full sales tax rate, while
// most other states exempt raw groceries (Produce/Meat & Seafood/Dairy & Eggs/
// Bakery & Bread/Frozen/Pantry) but still tax candy, soda, and prepared/hot food
// at the general rate. STANDARD_CATEGORIES has no separate "candy" or "soda"
// bucket — those live inside Snacks/Beverages alongside chips, water, coffee,
// and juice — so per-state Snacks/Beverages exemption here is a category-level
// proxy for those carve-outs (majority item in each bucket wins), not an exact
// item-level rule, and hot/prepared deli food has no dedicated category at all.
// See taxRates.json's `exemptCategories` per state for the underlying data and
// citations backing each state's grouping; kept in sync with the server-side
// mirror in supabase/functions/_shared/taxLookup.ts.
export function isTaxExempt(
  category: string | null | undefined,
  state: string | null | undefined
): boolean {
  if (!category || !state) return false;
  const row = TAX_STATES.find((s) => s.state === state.toUpperCase().trim());
  if (!row) return false;
  if (row.generalSalesTaxRate === 0) return true; // no state sales tax at all
  return row.exemptCategories.includes(category);
}
