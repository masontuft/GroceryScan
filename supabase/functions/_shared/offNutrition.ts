// Fetches nutrition/health data from Open Food Facts for a resolved product.
// Deliberately a plain async function, not a PricingProvider-style class/registry
// — there is exactly one nutrition data source today, unlike pricing which fans
// out across multiple store chains.

export interface OffNutriments {
  energyKcalPer100g: number | null;
  sugarsPer100g: number | null;
  saltPer100g: number | null;
  saturatedFatPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  proteinsPer100g: number | null;
}

export interface OffNutritionResult {
  found: boolean;
  nutriscoreGrade: string | null;
  novaGroup: number | null;
  nutriments: OffNutriments | null;
  ingredientsText: string | null;
  allergensTags: string[];
  additivesTags: string[];
}

const OFF_NUTRITION_FIELDS =
  'nutriscore_grade,nova_group,nutriments,ingredients_text,allergens_tags,additives_tags';

const NOT_FOUND: OffNutritionResult = {
  found: false,
  nutriscoreGrade: null,
  novaGroup: null,
  nutriments: null,
  ingredientsText: null,
  allergensTags: [],
  additivesTags: [],
};

// Strips OFF's language-prefixed tag format (e.g. "en:milk" -> "milk"),
// matching the categories_tags handling already used for identity resolution.
function stripLangPrefix(tag: string): string {
  return tag.replace(/^\w+:/, '');
}

export async function fetchOffNutrition(variants: string[]): Promise<OffNutritionResult> {
  for (const variant of variants) {
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${variant}.json?fields=${OFF_NUTRITION_FIELDS}`,
        { headers: { 'User-Agent': 'GroceryScan/1.0 (masontuft@gmail.com)' } }
      );
      if (!res.ok) continue;
      const json = await res.json() as {
        status?: number;
        product?: {
          nutriscore_grade?: string;
          nova_group?: number;
          nutriments?: Record<string, number>;
          ingredients_text?: string;
          allergens_tags?: string[];
          additives_tags?: string[];
        };
      };
      if (json.status !== 1 || !json.product) continue;

      const p = json.product;
      const n = p.nutriments ?? {};
      return {
        found: true,
        nutriscoreGrade: p.nutriscore_grade ?? null,
        novaGroup: p.nova_group ?? null,
        nutriments: {
          energyKcalPer100g: n['energy-kcal_100g'] ?? null,
          sugarsPer100g: n['sugars_100g'] ?? null,
          saltPer100g: n['salt_100g'] ?? null,
          saturatedFatPer100g: n['saturated-fat_100g'] ?? null,
          fatPer100g: n['fat_100g'] ?? null,
          fiberPer100g: n['fiber_100g'] ?? null,
          proteinsPer100g: n['proteins_100g'] ?? null,
        },
        ingredientsText: p.ingredients_text ?? null,
        allergensTags: (p.allergens_tags ?? []).map(stripLangPrefix),
        additivesTags: (p.additives_tags ?? []).map(stripLangPrefix),
      };
    } catch {
      // try next variant
    }
  }
  return NOT_FOUND;
}
