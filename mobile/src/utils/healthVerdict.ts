// Implements the rubric documented in docs/health-verdict-rubric.md exactly.
// If the scoring rules change, update that doc first, then mirror the
// constants below to match.
import type { NutritionInfo } from '../types/nutrition';
import { nutrientLevel } from './nutritionScore';

export type HealthVerdictTier = 'great' | 'good' | 'moderate' | 'limit' | 'unknown';

export interface HealthVerdict {
  tier: HealthVerdictTier;
  label: string;
  color: string;
  score: number | null;
}

const NUTRISCORE_POINTS: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, e: 4 };
const NUTRISCORE_UNKNOWN_POINTS = 2;

const NOVA_POINTS: Record<number, number> = { 1: 0, 2: 0, 3: 1, 4: 3 };
const NOVA_UNKNOWN_POINTS = 1;

const UNKNOWN_VERDICT: HealthVerdict = { tier: 'unknown', label: 'Not enough data', color: '#94a3b8', score: null };

export function computeHealthVerdict(nutrition: NutritionInfo | null): HealthVerdict {
  if (!nutrition) return UNKNOWN_VERDICT;

  const { nutriScoreGrade, novaGroup, nutriments } = nutrition;
  if (nutriScoreGrade === null && novaGroup === null && nutriments === null) {
    return UNKNOWN_VERDICT;
  }

  const nutriScorePoints = nutriScoreGrade !== null
    ? NUTRISCORE_POINTS[nutriScoreGrade]
    : NUTRISCORE_UNKNOWN_POINTS;

  const novaPoints = novaGroup !== null ? NOVA_POINTS[novaGroup] : NOVA_UNKNOWN_POINTS;

  const trafficLightPoints = nutriments
    ? (['sugars', 'salt', 'saturatedFat', 'fat'] as const).reduce((sum, key) => {
        const gramsPer100g = {
          sugars: nutriments.sugarsPer100g,
          salt: nutriments.saltPer100g,
          saturatedFat: nutriments.saturatedFatPer100g,
          fat: nutriments.fatPer100g,
        }[key];
        return sum + (nutrientLevel(key, gramsPer100g) === 'high' ? 1 : 0);
      }, 0)
    : 0;

  const score = nutriScorePoints + novaPoints + trafficLightPoints;

  if (score <= 2) return { tier: 'great', label: 'Great choice', color: '#22c55e', score };
  if (score <= 5) return { tier: 'good', label: 'Good', color: '#84cc16', score };
  if (score <= 8) return { tier: 'moderate', label: 'Consume in moderation', color: '#f59e0b', score };
  return { tier: 'limit', label: 'Limit intake', color: '#ef4444', score };
}
