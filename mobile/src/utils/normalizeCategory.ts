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

// Category-based exemption used to be state-agnostic (Produce/Meat/Dairy/Bakery
// always exempt), which is wrong: states like Idaho, Mississippi, Alabama, South
// Dakota, and Hawaii tax raw groceries at close to the full sales tax rate, while
// many other states exempt them. Default every item taxable so the per-state
// groceryTaxRate in taxRates.json (see supabase/functions/_shared/taxLookup.ts)
// is what actually gates tax at the basket level, rather than being silently
// zeroed out here first. A real fix needs state+category-aware taxability rules
// (e.g. many exempt-grocery states still tax candy/soda/prepared food) — that's
// unbuilt; this function is the intended seam for it.
export function isTaxExempt(_category: string | null | undefined): boolean {
  return false;
}
