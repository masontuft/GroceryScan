import type { NovaGroup, NutriScoreGrade } from '../types/nutrition';

export function nutriScoreColor(grade: NutriScoreGrade | null): string {
  switch (grade) {
    case 'a': return '#038141';
    case 'b': return '#85BB2F';
    case 'c': return '#FECB02';
    case 'd': return '#EE8100';
    case 'e': return '#E63E11';
    default: return '#94a3b8';
  }
}

export function novaGroupLabel(group: NovaGroup | null): string {
  switch (group) {
    case 1: return 'Unprocessed or minimally processed';
    case 2: return 'Processed culinary ingredients';
    case 3: return 'Processed food';
    case 4: return 'Ultra-processed food';
    default: return 'Unknown';
  }
}

export function novaGroupColor(group: NovaGroup | null): string {
  switch (group) {
    case 1: return '#22c55e';
    case 2: return '#84cc16';
    case 3: return '#f59e0b';
    case 4: return '#ef4444';
    default: return '#94a3b8';
  }
}

export type NutrientLevel = 'low' | 'medium' | 'high';
export type NutrientKey = 'sugars' | 'salt' | 'saturatedFat' | 'fat';

// UK FSA "traffic light" front-of-pack thresholds, grams per 100g.
const FSA_THRESHOLDS: Record<NutrientKey, { low: number; high: number }> = {
  fat: { low: 3, high: 17.5 },
  saturatedFat: { low: 1.5, high: 5 },
  sugars: { low: 5, high: 22.5 },
  salt: { low: 0.3, high: 1.5 },
};

export function nutrientLevel(key: NutrientKey, gramsPer100g: number | null): NutrientLevel | null {
  if (gramsPer100g === null) return null;
  const t = FSA_THRESHOLDS[key];
  if (gramsPer100g <= t.low) return 'low';
  if (gramsPer100g > t.high) return 'high';
  return 'medium';
}

export function nutrientLevelColor(level: NutrientLevel | null): string {
  switch (level) {
    case 'low': return '#22c55e';
    case 'medium': return '#f59e0b';
    case 'high': return '#ef4444';
    default: return '#94a3b8';
  }
}
