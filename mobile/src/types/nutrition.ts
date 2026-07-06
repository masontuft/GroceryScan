export type NutriScoreGrade = 'a' | 'b' | 'c' | 'd' | 'e';
export type NovaGroup = 1 | 2 | 3 | 4;

export interface Nutriments {
  energyKcalPer100g: number | null;
  sugarsPer100g: number | null;
  saltPer100g: number | null;
  saturatedFatPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  proteinsPer100g: number | null;
}

export interface NutritionInfo {
  nutriScoreGrade: NutriScoreGrade | null;
  novaGroup: NovaGroup | null;
  nutriments: Nutriments | null;
  ingredientsText: string | null;
  allergens: string[];
  additives: string[];
  source: string | null;
  fetchedAt: string | null;
}
